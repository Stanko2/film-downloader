import { Router } from 'express'
import fs from 'fs'
import db from './db'
import { URL } from 'url'
import DownloadCommand from './downloadCommand'
import path from 'path'
import { IsVideo, getStreamMetadata, parseHlsQuality } from './util'
import { getMovieFromID, init, searchMovie } from './tmdb'
import { Qualities } from '@movie-web/providers'
import axios from 'axios'
import { getAllMovies, getMovieDetails, reloadLibrary } from './library'
import { ScrapeMovie, listSources } from './scraper'

const router = Router()
init()

router.get('/reload', async (_req, res) => {
  await reloadLibrary('films').catch((err) => {
    console.error(err);
    res.render('error', {error: err});
  })
  res.redirect('/')
})

router.get('/', async (_req, res)=>{
  const data = JSON.parse(await db.client.get('moviesLibrary') || '[]')
  if(data.length == 0) {
    await reloadLibrary('films').catch((err) => {
      console.error(err);
      res.render('error', {error: err});
    })
  }
  res.render('pages/movies/list', {
    films: data
  })
})

router.get('/:id/streams', async (req,res) => {
  const films = await getAllMovies()
  const location = await db.getSaveLocation('films')
  const filmName = films[parseInt(req.params.id)] 
  const streamNames = fs.readdirSync(path.join(location, filmName)).filter(x=> IsVideo(x))
  const streams: any[] = []
  const details = await getMovieDetails(filmName).catch(()=>null)
  for (const stream of streamNames) {
    const p = path.join(location, filmName, stream)
    const data = await getStreamMetadata(p, stream).catch((err)=> {
      return {
        name: stream,
        error: err
      }
    })
    streams.push(data)
  }
  res.render('pages/movies/stats', { film: {
      name: filmName,
      streams: streams
    },
    details,
    id: req.params.id
  })
})
  
router.post('/add', async (req, res)=> {
    try {
        const url:string = req.body.FilmURL
        new URL(url)
        const name = `${req.body.FilmName} (${req.body.releaseYear})`
        new DownloadCommand(url, await db.getSaveLocation('films') + `/${name}`, name, (out)=> {
            if (out){
                res.redirect('/films')
            }
            else res.render('error', {error: 'file is not downloadable'})
        }, {}, 'file');
    }
    catch(e) {
        res.render('error', { error: e })
    }
})

router.get('/:id/watch/:streamId/file', async (req,res) => {
  try {
    const movies = await getAllMovies()
    const filmName = movies[parseInt(req.params.id)] 
    const stream = fs.readdirSync(path.join(await db.getSaveLocation('films'), filmName)).filter(x=> IsVideo(x))[parseInt(req.params.streamId)];
    res.sendFile(path.join(await db.getSaveLocation('films'), filmName, stream))
  } catch (error) {
    res.render('error', {error})
  }
})

router.get('/:id/watch/:streamId', async (req,res) => {
  try {
    const movies = await getAllMovies()
    const filmName = movies[parseInt(req.params.id)] 
    const details = await getMovieDetails(filmName);
    res.render('videoplayer', {
      thumbnail: details?.backdrop_path,
      poster: details?.poster_path,
      url: `/films/${req.params.id}/watch/${req.params.streamId}/file`,
      title: details?.title || filmName,
    })
  } catch (error) {
    res.render('error', {error})
  }
})


router.get('/add', (_req, res) => {
    res.render('pages/movies/add')
})

router.post('/add/search', async (req,res)=> {
  const query = req.body.FilmName
  console.log(query);
  res.redirect('/films/add/searchResult?q=' + query);
})

router.get('/add/searchResult', async (req, res) => {
  if(!req.query.q) {
    res.send('No query')
    res.statusCode = 400
    return
  }
  const result = await searchMovie(req.query.q as string, undefined)
  res.render('pages/searchResults', {
    query: req.query.q,
    result,
    movie: true
  })
})
  
router.get('/download/:id', async (req,res) => {
  const data = await getMovieFromID(req.params.id)
  const providers = await ScrapeMovie(data, req.query.source as string)
  const stream = providers?.stream
  if(stream == undefined) {
    res.render('error', {error: 'No stream found'})
    return
  }
  let qualities: Partial<Record<Qualities, string>> = {}
  if(stream.type == 'file'){
    Object.keys(stream.qualities).forEach((q) => {
      qualities[q] = stream.qualities[q].url
    })
  } else {
    const playlistRes = await axios.get(stream.playlist, {responseType: 'text'}).catch(() => null)
    if((playlistRes?.status || 404) < 300) {
      const playlist = playlistRes?.data
      qualities = parseHlsQuality(playlist)
    }
  }

  res.render('pages/qualityChooser', {
    pageType: 'movie',
    title: data.title,
    qualities,
    type: stream.type,
    postUrl: req.originalUrl,
    captions: providers?.stream.captions.map(x => {
      return {
        text: x.language,
        value: x.url
      }
    }),
    source: providers?.sourceId,
    banner: data?.poster_path,
    sources: listSources().map(x => {
      return {
        text: x.name,
        value: req.originalUrl.split('?')[0] + '?source=' + x.id
      }
    })
  })
})

router.post('/download/:id', async (req, res) => {
  const data = await getMovieFromID(req.params.id)
  const location = await db.getSaveLocation('films')
  const dirName = `${data.title} (${new Date(data.release_date).getFullYear()})`
  const url = req.body.url;
  const streamType = req.body.type;
  const captions: Record<string, string> = {}

  for (const c of req.body.caption || []) {
    const [lang, url] = c.split('$$$')
    captions[lang] = url
  }
  
  res.redirect('/films')
  const cmd = new DownloadCommand(url, path.join(location, dirName), dirName, ()=> {return}, captions, streamType);
  cmd.scrapeArgs = {
    type: 'movie',
    data,
    quality: req.body.quality,
    source: req.body.source
  }
})


export default router
