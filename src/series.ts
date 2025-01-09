import { Router } from 'express'
import fs from 'fs'
import db from './db'
import DownloadCommand from './downloadCommand'
import path from 'path'
import { IsVideo, parseHlsQuality, getStreamMetadata, parseSeasonEpisode, compareQualities } from './util'
import { getSeasonDetails, getTvShowFromID, init, searchSeries } from './tmdb'
import { Qualities } from './providerLib'
import axios from 'axios'
import { scrapeEpisode, getDownloadLinks, listSources } from './scraper'
import { addEpisode, getAllShows, getEpisodeName, getShowDetails, getYear, reloadLibrary } from './library'
import multer from 'multer'
import { Playlist } from 'hls-parser/types'

const upload = multer({ dest: 'uploads/' })
const router = Router()

init()

router.get('/reload', async (_req, res) => {
  await reloadLibrary('series').catch((err) => {
    res.render('error', {error: err});
  })
  res.redirect('/')
})

router.get('/', async (_req, res)=>{
  const data = JSON.parse(await db.client.get('Library:series') || '[]')
  if(data.length == 0) {
    await reloadLibrary('series').catch((err) => {
      res.render('error', {error: err});
    })
    res.render('pages/tvShows/list', {
      films: JSON.parse(await db.client.get('Library:series') || '[]')
    })
    return
  }
  res.render('pages/tvShows/list', {
    films: data
  })
})

router.get('/:id/streams', async (req,res) => {
  const shows = await getAllShows()
  const location = await db.getSaveLocation('series')
  const showName = shows[parseInt(req.params.id) - 1]
  const streamNames = fs.readdirSync(path.join(location, showName)).filter(x=> IsVideo(x)).sort()
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
    const stream = fs.readdirSync(path.join(await db.getSaveLocation('series'), showName)).filter(x=> IsVideo(x)).sort()[parseInt(req.params.streamId)];
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

  const url = req.originalUrl.split('?')[0]

  res.render('pages/qualityChooser', {
    pageType: 'series',
    title: data.name,
    postUrl: undefined,
    captions: [],
    banner: data.poster_path,
    id: req.params.id,
    sources: listSources().map(x => {
      return {
        text: x.name,
        value: url + '?source=' + x.id
      }
    }),
    seasons: data.seasons.map(x=> x.episode_count)
  })
})

router.get('/download/:id/scrape', async (req, res) => {
  const data = await getTvShowFromID(req.params.id)
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  //@ts-ignore req.query is not typed
  const metadata  = await scrapeEpisode(data, parseInt(req.query.season ?? '1'), parseInt(req.query.episode ?? '1'), req.query.source as string);
  const stream = metadata?.stream
  const url = req.originalUrl.split('?')[0]
  let qualities: Record<string, string> = {}
  if (stream?.type == 'file'){
    Object.keys(stream.qualities).forEach((q) => {
      qualities[q] = stream.qualities[q].url
    })
  } else if (stream?.type == 'hls' && stream?.playlist) {
    const manifest = await (await axios.get(stream?.playlist, {
      headers: stream?.headers
    })).data
    qualities = parseHlsQuality(manifest, stream?.playlist) as Record<string, string>
  }

  res.render('pages/qualityChooser', {
    pageType: 'series',
    title: data.name,
    qualities,
    postUrl: '/series/download/' + req.params.id,
    captions: stream?.captions.map(cap => {
      return {
        text: cap.language,
        value: cap.url
      }
    }),
    source: metadata?.sourceId,
    type: stream?.type,
    banner: data.poster_path,
    id: req.params.id,
    sources: listSources().map(x => {
      return {
        text: x.name,
        value: url + '?source=' + x.id
      }
    }),
    seasons: data.seasons.map(x=> x.episode_count)
  })
})

router.post('/upload/:id', upload.single('file'), async (req, res) => {
  if(!req.file) {
    res.send({error: 'No files uploaded'})
    return
  }
  if (!req.body.season || !req.body.episode) {
    res.send({error: 'No season or episode selected'})
    return
  }
  const extname = path.extname(req.file.originalname);
  await addEpisode(req.params.id, req.file.path, extname, req.body.season, req.body.episode);
  res.send({success: true})
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
      console.log(dirName);
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
        if(!src) {
          src = link.src.stream.qualities[(Object.keys(link.src.stream.qualities) as Qualities[]).sort(compareQualities)[0]]?.url
        }
      } else {
        console.log(link.src.stream.playlist);
        const manifest = await axios.get(link.src.stream.playlist, {
          responseType: 'text',
          headers: link.src.stream.headers
        }).then(res => res.data)
        const parsed = parseHlsQuality(manifest, link.src.stream.playlist);
        src = parsed[req.body.quality as Qualities]
        if(!src) {
          src = parsed[(Object.keys(parsed) as Qualities[]).sort(compareQualities)[0]]
        }
      }

      if(!src) {
        throw new Error(`no media found for quality ${req.body.quality}`)
      }

      const cmd = new DownloadCommand(src, await db.getSaveLocation('series') + '/' + dirName, fileName, ()=> {
        return
      }, captions, link.src.stream.type, link.src.stream.headers ?? {})

      cmd.scrapeArgs = {
        type: 'show',
        data,
        quality: req.body.quality,
        source: req.body.source,
        season: link.season,
        episode: link.episode
      }
    }
  }).catch(err=> console.log(err))
})

export default router
