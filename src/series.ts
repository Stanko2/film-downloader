import { Router } from 'express'
import fs from 'fs'
import db from './db'
import DownloadCommand from './downloadCommand'
import path from 'path'
import { IsVideo, parseHlsQuality, getStreamMetadata, parseSeasonEpisode } from './util'
import { getSeasonDetails, getTvShowFromID, init, searchSeries } from './tmdb'
import { FileBasedStream, Qualities } from '@movie-web/providers'
import axios from 'axios'
import { scrapeEpisode, getDownloadLinks, listSources } from './scraper'
import { getAllShows, getEpisodeName, getShowDetails, getYear, reloadLibrary } from './library'

const router = Router()

init()

router.get('/reload', async (_req, res) => {
  await reloadLibrary('series').catch((err) => {
    console.error(err);
    res.render('error', {error: err});
  })
  res.redirect('/')
})

router.get('/', async (_req, res)=>{
  const data = JSON.parse(await db.client.get('Library:series') || '[]')
  if(data.length == 0) {
    await reloadLibrary('series').catch((err) => {
      console.error(err);
      res.render('error', {error: err});
    })
    res.render('pages/tvShows/list', {
      films: JSON.parse(await db.client.get('Library:series') || '[]')
    })
  }
  res.render('pages/tvShows/list', {
    films: data
  })
})

router.get('/:id/streams', async (req,res) => {
  const shows = await getAllShows()
  const location = await db.getSaveLocation('series')
  const showName = shows[parseInt(req.params.id) - 1]
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
    const showName = shows[parseInt(req.params.id) - 1]
    const stream = fs.readdirSync(path.join(await db.getSaveLocation('series'), showName)).filter(x=> IsVideo(x))[parseInt(req.params.streamId)];
    res.sendFile(path.join(await db.getSaveLocation('series'), showName, stream))
  } catch (error) {
    res.render('error', {error})
  }
})

router.get('/:id/watch/:streamId', async (req,res) => {
  const shows = await getAllShows()
  try {
    const showName = shows[parseInt(req.params.id) - 1]
    const details = await getShowDetails(showName);
    res.render('videoplayer', {
      thumbnail: details?.backdrop_path,
      poster: details?.poster_path,
      url: `/series/${req.params.id}/watch/${req.params.streamId}/file`,
      title: details?.name || showName,
    })
  } catch (error) {
    res.render('error', {error})
  }
})

router.get('/add', (_req, res) => {
    res.render('pages/tvShows/add')
})

router.post('/add', async (req, res)=> {
  try {
    const name = req.body.SeriesName + ' (' + req.body.year + ')'
    const episodeName = name + ' ' + getEpisodeName(req.body.season, req.body.episode)
    new DownloadCommand(req.body.showUrl, path.join(await db.getSaveLocation('series'), name), episodeName, (success)=> {
      if(!success) {
        res.render('error', {error: 'Failed to download'})
      } else {
        res.redirect('/series')
      }
    }, {}, 'file');
  } catch (e) {
    res.render('error', { error: e })
  }
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
        const manifest = await axios.get(link.src.stream.playlist, {
          responseType: 'text'
        }).then(res => res.data)
        src = parseHlsQuality(manifest)[req.body.quality as Qualities]
      }

      if(!src) {
        throw new Error(`no media found for quality ${req.body.quality}`)
      }

      const cmd = new DownloadCommand(src, await db.getSaveLocation('series') + '/' + dirName, fileName, ()=> {
        return
      }, captions, link.src.stream.type)
      
      cmd.scrapeArgs = {
        type: 'show',
        data,
        quality: req.body.quality,
        source: req.body.source,
        season: link.season,
        episode: link.episode
      }
    }
  })
})

export default router
