import express from 'express'
import bodyparser from 'body-parser'
import settings from './settings'
import films from './films'
import series from './series'
import db from './db'
import { downloaders, Init } from './downloader'

const app = express()

app.set('view engine', 'ejs')
app.use(bodyparser.urlencoded({extended: true}))
app.use('/settings', settings)
app.use('/films', films)
app.use('/series', series)

Init().then(()=>{
  app.listen(process.env.PORT || 3000, ()=>{
    console.log('server started')
  })
})


app.get('/', async (_req, res) => {
  const stateMap = {
    scheduled: 'info',
    complete: 'success',
    error: 'danger',
    inProgress: 'secondary'
  }
  return res.render('index', {
    Downloads: (await db.getAllDownloads()).filter(d => d.state != 'complete'),
    complete: (await db.getAllDownloads()).filter(d => d.state == 'complete'),
    stateMap
  })
})


app.post('/:id/download', (req, res)=> {
  const id = parseInt(req.params.id)
  downloaders[id].startDownload()
  res.redirect('/')
})

app.post('/:id/cancel', (req,res) => {
  const id = parseInt(req.params.id)
  downloaders[id].cancel()
  res.redirect('/')
})

app.post('/:id/restart', (req,res) => {
  const id = parseInt(req.params.id)
  db.updateDownloadById(id, downloaders[id].toDownloadCommand('scheduled')).then(()=> {
    downloaders[id].startDownload()
    res.redirect('/')
  })
})