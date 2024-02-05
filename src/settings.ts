import { Router } from 'express'
import db from './db'
import scheduler from './scheduler'
import { api as tmdb } from './tmdb'

const router = Router()

router.get('/', async (_req,res) => {
    console.log((await db.getTMDBSessionId()).length);
    
    res.render('pages/settings', {
        seriesPath: await db.getSaveLocation('series'),
        filmsPath: await db.getSaveLocation('films'),
        downloadCron: await db.getDownloadCron(),
        session: (await db.getTMDBSessionId()).length > 0,
    })
})

router.post('/update', async (req, res) => {
    try{
        await db.setSaveLocation('series', req.body.seriesPath)
        await db.setSaveLocation('films', req.body.filmsPath)
        await scheduler.updateCron(req.body.downloadCron)
        // await db.client.set('TMDB_accountId', req.body.accountId)
        res.redirect('/settings')
    }
    catch (e) {
        res.render('error', {error: e})
    }
})

router.get('/login', async (_req, res) => {
    try {
        const token = (await tmdb?.authentication.createRequestToken())?.data.request_token
        if(!token) {
            throw new Error('Failed to get token')
        }
        const base = process.env.BASE_URL
        res.redirect(`https://www.themoviedb.org/authenticate/${token}?redirect_to=${base}/settings/authorize`);
    } catch (error) {
        res.render('error', {error})
    }
})

router.get('/authorize', async (req, res) => {
    try {
        const session = await tmdb?.authentication.createSession({body: {
            request_token: req.query.request_token?.toString() || ''
        }})
        if(!session?.data.session_id) {
            throw new Error('Failed to get session id')
        }
        await db.client.set('TMDB_sessionId', session.data.session_id)
        res.redirect('/settings')
    } catch (error) {
        res.render('error', {error})
    }
})

export default router
