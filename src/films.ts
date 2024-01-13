import { Router } from 'express'
import fs from 'fs'
import db from './db'
import { URL } from 'url'
import Downloader from './downloader'
import path from 'path'
import { IsVideo, getStreamMetadata, listSources, parseHlsQuality } from './util'
import { getMovieFromID, init, searchMovie } from './tmdb'
import { Qualities, RunnerOptions, makeProviders, makeStandardFetcher, targets } from '@movie-web/providers'
import MovieDB from 'node-themoviedb'
import fetch from 'node-fetch'
import axios from 'axios'

const router = Router()
init()



async function getAllMovies() {
  const location = await db.getSaveLocation('films') 
  if(fs.existsSync(location)){
  const films = fs.readdirSync(location).filter(x => fs.statSync(path.join(location, x)).isDirectory())
    return films
  }
  else throw new Error('Film library non-existed or non specified')
}

async function getMovieDetails(name: string) {
  let id = parseInt(await db.client.get('movies:'+ name.replaceAll(' ', '-')) || 'NaN')
  if(isNaN(id)) {
    const data = await searchMovie(name, undefined)
    if(data.length == 0) {
      return null
    }
    await db.client.set('movies:'+ name, data[0].id)
    id = data[0].id
  }
  return await getMovieFromID(id.toString())
}

async function reloadMovieDatabase() {
  const movies = await getAllMovies()
  const movieLibrary: any[] = []
  for (const [i, movie] of movies.entries()) {
    const details = await getMovieDetails(movie)
    movieLibrary.push({
      name: details?.title || movie,
      id: i,
      poster: details?.poster_path
    })
  }
  db.client.set('moviesLibrary', JSON.stringify(movieLibrary))
}

router.get('/reload', async (_req, res) => {
  await reloadMovieDatabase()
  res.redirect('/')
})

router.get('/', async (_req, res)=>{
  const data = JSON.parse(await db.client.get('moviesLibrary') || '[]')
  if(data.length == 0) {
    await reloadMovieDatabase()
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
  const details = await getMovieDetails(filmName) || null
  for (const stream of streamNames) {
    const p = path.join(location, filmName, stream)
    const data = await getStreamMetadata(p, stream)
    streams.push(data)
  }
  res.render('pages/movies/stats', { film: {
      name: filmName,
      streams: streams
    },
    details
  })
})
  
router.post('/add', async (req, res)=> {
    try {
        const url:string = req.body.FilmURL
        new URL(url)
        const name = `${req.body.FilmName} (${req.body.releaseYear})`
        new Downloader(url, await db.getSaveLocation('films') + `/${name}`, name, (out)=> {
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
  const providers = await getProviders(data, req.query.source as string)
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
    const playlist = (await axios.get(stream.playlist).catch(err => console.log(err))
    )?.data
    qualities = parseHlsQuality(playlist)
  }

  res.render('pages/qualityChooser', {
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
    banner: data.poster_path,
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
  new Downloader(url, path.join(location, dirName), dirName, ()=> {return}, captions, streamType);
})

async function getProviders(movieData: MovieDB.Responses.Movie.GetDetails, source: string | undefined) {
  const fetcher = makeStandardFetcher(fetch)
  const providers = makeProviders({
    fetcher,
    target: targets.ANY
  })

  
  const scrapeArgs: RunnerOptions = {
    media: {
      type: 'movie',
      title: movieData.title,
      tmdbId: movieData.id.toString() || '',
      imdbId: movieData.imdb_id ?? undefined,
      releaseYear: new Date(movieData.release_date).getFullYear()
    }, 
    sourceOrder: source ? [source] : undefined
  }

  return await providers.runAll(scrapeArgs)
}

export default router
