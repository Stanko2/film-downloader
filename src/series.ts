import { Router } from 'express'
import fs from 'fs'
import db from './db'
import Downloader from './downloader'
import path from 'path'
import { IsVideo, parseHlsQuality, getStreamMetadata } from './util'
import { getTvShowFromID, init, searchSeries } from './tmdb'
import { Qualities, RunOutput, makeProviders, makeStandardFetcher, targets } from '@movie-web/providers'
import MovieDB from 'node-themoviedb'

const router = Router()

init()


// interface ShowScrapeData {
//   src: RunOutput;
//   season: number;
//   episode: number;
// }

function getEpisodeName(season: number, episode: number) {
  let ret = 'S'
  if (season < 10)
    ret+='0'
  ret+=season.toString() + 'E'
  if (episode < 10)
    ret+='0'
  ret+=episode.toString()
  return ret
}

function getYear(release_date: string): number {
  return new Date(release_date).getFullYear()
}

async function getAllShows() {
  const location = await db.getSaveLocation('series') 
  if(fs.existsSync(location)){
    const films = fs.readdirSync(location).filter(x => fs.statSync(path.join(location, x)).isDirectory())
    return films
  }
  else throw new Error('Film library non-existed or non specified')
}

async function getShowDetails(name: string) {
  name = name.split('(')[0]
  console.log(name);
  
  let id = parseInt(await db.client.get('series:'+ name) || 'NaN')
  if(isNaN(id)) {
    const data = await searchSeries(name)
    console.log(data);
    
    if(data.length == 0) {
      return null
    }
    await db.client.set('series:'+ name, data[0].id)
    id = data[0].id
  }
  
  return getTvShowFromID(id.toString())
}


async function reloadShowDatabase() {
  const showLibrary = []
  const shows = await getAllShows()
  for (const [i, show] of shows.entries()) {
    const details = await getShowDetails(show)
    showLibrary.push({
      name: show,
      poster: details?.poster_path,
      id: i
    })
  }

  db.client.set('seriesLibrary', JSON.stringify(showLibrary))
}

router.get('/reload', async (_req, res) => {
  await reloadShowDatabase()
  res.redirect('/')
})

router.get('/', async (_req, res)=>{
  const data = JSON.parse(await db.client.get('seriesLibrary') || '[]')
  if(data.length == 0) {
    await reloadShowDatabase()
  }
  res.render('pages/tvShows/list', {
    films: data
  })
})

router.get('/:id/streams', async (req,res) => {
  const shows = await getAllShows()
  const location = await db.getSaveLocation('films')
  const showName = shows[parseInt(req.params.id)] 
  const streamNames = fs.readdirSync(path.join(location, showName)).filter(x=> IsVideo(x))
  const streams: any[] = []
  const details = await getShowDetails(showName) || null
  for (const stream of streamNames) {
    const p = path.join(location, showName, stream)
    const data = await getStreamMetadata(p, stream)
    streams.push(data)
  }
  res.render('pages/tvShows/stats', { film: {
      name: showName,
      streams: streams,
    },
    details: details
  })
})
  
router.get('/add', (_req, res) => {
    res.render('pages/tvShows/add')
})

router.post('/add/search', async (req,res)=> {
  const query = req.body.SeriesName
  res.redirect('/series/add/searchResult?q=' + query);
})

router.get('/add/searchResult', async (req, res) => {
  if(!req.query.q) {
    res.send('No query')
    res.statusCode = 400
    return
  }
  const result = await searchSeries(req.query.q as string)
  res.render('pages/searchResults', {
    query: req.query.q,
    result,
    movie: false
  })
})
  
router.get('/download/:id', async (req,res) => {
  const data = await getTvShowFromID(req.params.id)
  // const providers = await getDownloadLinks(data)
  const metadata  = await scrapeEpisode(data, 1, 1);
  if (metadata?.stream.type == 'file'){
    res.render('pages/qualityChooser', {
      title: data.name,
      qualities: Object.keys(metadata.stream.qualities),
      postUrl: `/series/download/${req.params.id}`,
      captions: metadata.stream.captions,
      source: metadata.sourceId,
      banner: data.poster_path
    })
  } else if (metadata?.stream.type == 'hls' && metadata?.stream.playlist) {
    // res.render('error', {error: 'HLS streams not yet supported'});
    const manifest = await fetch(metadata?.stream.playlist).then(res => res.text())
    res.render('pages/qualityChooser', {
      title: data.name,
      qualities: Object.keys(parseHlsQuality(manifest)),
      postUrl: `/series/download/${req.params.id}`,
      captions: metadata?.stream.captions,
      source: metadata?.sourceId,
      banner: data.poster_path
    })
  }
})

router.post('/download/:id', (req, res) => {
  res.redirect('/series')
  console.log(req.body);
  
  getTvShowFromID(req.params.id).then(async (data)=> {
    for await (const link of getDownloadLinks(data)) {
      const dirName = `${data.name} (${getYear(data.first_air_date)})`
      const fileName = `${dirName} ${getEpisodeName(link.season, link.episode)}`
      const captions:Record<string, string> = {}
      let src: string | undefined
      for (const caption of link.src.stream.captions) {
        if(req.body.caption.includes(caption.language)){
          captions[caption.language] = caption.url
        }
      }
      if(link.src.stream.type == 'file'){
        src = link.src.stream.qualities[req.body.quality as Qualities]?.url
      } else {
        const manifest = await fetch(link.src.stream.playlist).then(res => res.text())
        src = parseHlsQuality(manifest)[req.body.quality as Qualities]
      }

      if(!src) {
        throw new Error(`no media found for quality ${req.body.quality}`)
      }

      new Downloader(src, await db.getSaveLocation('series') + '/' + dirName, fileName, ()=> {
        return
      }, captions, link.src.stream.type)
      
    }
  })
})

async function* getDownloadLinks(showData: MovieDB.Responses.TV.GetDetails) {
  for (const season of showData.seasons) {
    for (let i = 0; i < season.episode_count; i++) {
      const s = await scrapeEpisode(showData, season.season_number, i+1);
      console.log(`scraped episode #${i + 1} of season ${season.season_number}`);
      if(s)
        yield {
          src: s,
          season: season.season_number,
          episode: i+1
      };
    }
  }
}

async function scrapeEpisode(data: MovieDB.Responses.TV.GetDetails, season: number, episode: number): Promise<RunOutput | null> {
  const fetcher = makeStandardFetcher(fetch)
  const providers = makeProviders({
    fetcher,
    target: targets.ANY
  })

  return providers.runAll({
    media: {
      type: 'show',
          episode: {
            number: episode,
            tmdbId: data.id.toString()
          },
          season: {
            number: season,
            tmdbId: data.id.toString()
          },
          releaseYear: new Date(data.first_air_date).getFullYear(),
          title: data.name,
          tmdbId: data.id.toString(),
    }
  })
}

export default router