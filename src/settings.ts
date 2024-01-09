import { Router } from 'express'
import db from './db'
import scheduler from './scheduler'

const router = Router()

router.get('/', async (_req,res) => {
    res.render('pages/settings', {
        seriesPath: await db.getSaveLocation('series'),
        filmsPath: await db.getSaveLocation('films'),
        downloadCron: await db.getDownloadCron()
    })
})

router.post('/update', async (req, res) => {
    try{
        await db.setSaveLocation('series', req.body.seriesPath)
        await db.setSaveLocation('films', req.body.filmsPath)
        await scheduler.updateCron(req.body.downloadCron)
        res.redirect('/settings')
    }
    catch (e) {
        res.render('error', {error: e})
    }
})

export default router