import { Router } from 'express'
import fs from 'fs'
import db from './db'
import { URL } from 'url'
import Downloader from './downloader'
import path from 'path'
import { ffprobe } from 'fluent-ffmpeg'
import { humanFileSize } from './util'

const router = Router()
const videoExtensions = ['m4v', 'avi','mpg','mp4', 'webm', 'mov', 'mkv']

function IsVideo(name: string): boolean {
  return videoExtensions.some(ext => name.endsWith(ext))
}


async function getAllFilms() {
  const location = await db.getSaveLocation('films') 
  if(fs.existsSync(location)){
    const films = fs.readdirSync(location).filter(x => fs.statSync(path.join(location, x)).isDirectory())
    return films
  }
  else throw new Error('Film library non-existed or non specified')
}

router.get('/', async (req, res)=>{
  const films = await getAllFilms()
  res.render('pages/films', {
    films: films.map((name, i) => {
      return {
        name,
        id: i
      }
    })
  })
})

async function getStreamMetadata(file: string, name: string) {
  return new Promise((resolve, reject) => {
    ffprobe(file, (err, data)=> {
      if(err){
        reject(err);
      }
      else {
        resolve({
          name,
          resolution: {
            width: data.streams.find(s => s.codec_type === 'video')?.coded_width,
            height: data.streams.find(s => s.codec_type === 'video')?.coded_height
          },
          metadata: {
            size: humanFileSize(data.format.size || 0, true, 2),
            bit_rate: humanFileSize(data.format.bit_rate || 0),
            duration: new Date((data.format.duration || 0) * 1000).toTimeString().substring(0, 8)
          }
        })
      }
    })

  })
}

router.get('/:id/streams', async (req,res) => {
  const films = await getAllFilms()
  const location = await db.getSaveLocation('films')
  const filmName = films[parseInt(req.params.id)] 
  const streamNames = fs.readdirSync(path.join(location, filmName)).filter(x=> IsVideo(x))
  const streams: any[] = []
  for (const stream of streamNames) {
    const p = path.join(location, filmName, stream)
    const data = await getStreamMetadata(p, stream)
    streams.push(data)
  }
  res.render('pages/filmStats', { film: {
      name: filmName,
      streams: streams
    }
  })
})
  
router.post('/add', async (req, res)=> {
    console.log(req.body)
    try {
        const url:string = req.body.FilmURL
        if(!IsVideo(url)){
            throw new Error('Invalid file extension, not video')
        }
        new URL(url)
        const name = `${req.body.FilmName} (${req.body.releaseYear})`
        new Downloader(url, await db.getSaveLocation('films') + `/${name}`, name, (out)=> {
            if (out){
                res.redirect('/films')
            }
            else res.render('error', {error: 'file is not downloadable'})
        });
    }
    catch(e) {
        res.render('error', { error: e })
    }
})

router.get('/add', (_req, res) => {
    res.render('pages/filmAdd')
})
  
export default router