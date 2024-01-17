import { Router } from 'express'
import fs from 'fs'
import db from './db'
import DownloadCommand from './downloadCommand'
import path from 'path'
import { IsVideo, parseHlsQuality, getStreamMetadata, listSources, parseFileName, parseSeasonEpisode } from './util'
import { getSeasonDetails, getTvShowFromID, init, searchSeries } from './tmdb'
import { FileBasedStream, Qualities, RunOutput, makeProviders, makeStandardFetcher, targets } from '@movie-web/providers'
import MovieDB from 'node-themoviedb'
import fetch from 'node-fetch'
import axios from 'axios'

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
  const [title] = parseFileName(name)
  console.log(title)
  let id = parseInt(await db.client.get('series:'+ name.replaceAll(' ', '-')) || 'NaN')
  if(isNaN(id)) {
    const data = await searchSeries(title)
    if(data.length == 0) {
      console.log('No data found for ' + name);
      
      return null
    }
    await db.client.set('series:'+ name.replaceAll(' ', '-'), data[0].id)
    id = data[0].id
  }
  
  return getTvShowFromID(id.toString())
}


async function reloadShowDatabase() {
  const showLibrary: any[] = []
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
  await reloadShowDatabase().catch((err) => {
    console.error(err);
    res.render('error', {error: err});
  })
  res.redirect('/')
})

router.get('/', async (_req, res)=>{
  const data = JSON.parse(await db.client.get('seriesLibrary') || '[]')
  if(data.length == 0) {
    await reloadShowDatabase().catch((err) => {
      console.error(err);
      res.render('error', {error: err});
    })
  }
  res.render('pages/tvShows/list', {
    films: data
  })
})

router.get('/:id/streams', async (req,res) => {
  const shows = await getAllShows()
  const location = await db.getSaveLocation('series')
  const showName = shows[parseInt(req.params.id)] 
  const streamNames = fs.readdirSync(path.join(location, showName)).filter(x=> IsVideo(x))
  const streams: any[] = []
  const details = await getShowDetails(showName) || null
  for (const stream of streamNames) {
    const p = path.join(location, showName, stream)
    const data = await getStreamMetadata(p, stream).catch((err)=> {
      return {
        name: stream,
        error: err
      }
    })
    const file = parseSeasonEpisode(stream)
    console.log(file);
    
    if(!file || !details) {
      streams.push({
        streamData: data,
        episodeData: null
      })
      continue
    }
    streams.push({
      streamData: data,
      episodeData: (await getSeasonDetails(details.id.toString(), file[0], file[1]))
    })

  }
  res.render('pages/tvShows/stats', { 
    show: {
      name: showName,
      streams: streams,
    },
    details: details,
    id: req.params.id
  })
})
  
router.get('/:id/watch/:streamId/file', async (req,res) => {
  const shows = await getAllShows()
  try {
    const showName = shows[parseInt(req.params.id)] 
    const stream = fs.readdirSync(path.join(await db.getSaveLocation('series'), showName)).filter(x=> IsVideo(x))[parseInt(req.params.streamId)];
    res.sendFile(path.join(await db.getSaveLocation('series'), showName, stream))
  } catch (error) {
    res.render('error', {error})
  }
})

router.get('/:id/watch/:streamId', async (req,res) => {
  const shows = await getAllShows()
  try {
    const showName = shows[parseInt(req.params.id)] 
    const details = await getShowDetails(showName);
    res.render('videoplayer', {
      thumbnail: details?.backdrop_path,
      url: `/series/${req.params.id}/watch/${req.params.streamId}/file`,
    })
  } catch (error) {
    res.render('error', {error})
  }
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
  const metadata  = await scrapeEpisode(data, 1, 1, req.query.source as string);
  let qualities: Record<string, string> = {}
  if (metadata?.stream.type == 'file'){
    Object.keys(metadata.stream.qualities).forEach((q) => {
      qualities[q] = (metadata.stream as FileBasedStream).qualities[q].url
    })
  } else if (metadata?.stream.type == 'hls' && metadata?.stream.playlist) {
    const manifest = await (await axios.get(metadata?.stream.playlist)).data
    qualities = parseHlsQuality(manifest)
  }
  const url = req.originalUrl.split('?')[0]
  console.log(qualities);
  
  res.render('pages/qualityChooser', {
    pageType: 'series',
    title: data.name,
    qualities,
    postUrl: req.originalUrl,
    captions: metadata?.stream.captions.map(cap => {
      return {
        text: cap.language,
        value: cap.url
      }
    }),
    source: metadata?.sourceId,
    type: metadata?.stream.type,
    banner: data.poster_path,
    sources: listSources().map(x => {
      return {
        text: x.name,
        value: url + '?source=' + x.id
      }
    }),
    seasons: data.seasons.map(x=> x.episode_count)
  })
})

router.post('/download/:id', (req, res) => {
  if (req.body.quality == undefined || req.body.source == undefined) {
    res.render('error', {error: 'No quality or source selected'})
    return
  }
  res.redirect('/series')
  getTvShowFromID(req.params.id).then(async (data)=> {
    for await (const link of getDownloadLinks(data, req.body.source, (season: number, episode: number) => {
     return req.body['season-' + season] && (req.body['season-' + season].includes(episode.toString()) || req.body['season-' + season] == episode.toString())
    })) {
      const dirName = `${data.name} (${getYear(data.first_air_date)})`
      const fileName = `${dirName} ${getEpisodeName(link.season, link.episode)}`
      if (fs.existsSync(await db.getSaveLocation('series') + '/' + dirName + '/' + fileName + '.mp4')) continue
      const captions:Record<string, string> = {}
      let src: string | undefined
      for (const caption of link.src.stream.captions || []) {
        if((req.body.caption?.split('$$$')[0] || []).includes(caption.language)){
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

      new DownloadCommand(src, await db.getSaveLocation('series') + '/' + dirName, fileName, ()=> {
        return
      }, captions, link.src.stream.type)
      
    }
  })
})

async function* getDownloadLinks(showData: MovieDB.Responses.TV.GetDetails, source: string, downloadEpisode: (season: number, episode: number) => boolean) {
  for (const season of showData.seasons) {
    for (let i = 0; i < season.episode_count; i++) {
      if(!downloadEpisode(season.season_number, i+1)) continue
      const s = await scrapeEpisode(showData, season.season_number, i+1, source);
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

async function scrapeEpisode(data: MovieDB.Responses.TV.GetDetails, season: number, episode: number, source: string | undefined): Promise<RunOutput | null> {
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
    },
    sourceOrder: source ? [source] : undefined
  }).catch(() => null)
}

export default router
