import fs from 'fs'
import db from "./db";
import { extname, join } from "path"
import { Downloader } from "./downloaders";
import FileDownloader from "./downloaders/file-download";
import HlsDownloader from "./downloaders/hls-download";
import axios from 'axios';
import MovieDB from 'node-themoviedb';
import { Qualities, RunOutput, Stream } from '@movie-web/providers';
import { ScrapeMovie, scrapeEpisode } from './scraper';
import { parseHlsQuality } from './util';
import { Logger } from './logger';

type DownloadType = 'hls' | 'file'

export interface IDownloadCommand {
    url: string
    dest: string
    name: string
    state: 'complete' | 'pause' | 'error' | 'scheduled' | 'inProgress';
    id: number
    type: 'hls' | 'file'
    error?: any
    progress?: number
    scrapeArgs?: showscrapeArgs | filmscrapeArgs
}

interface scrapeArgs {
    source: string;
    quality: Qualities;
}

interface showscrapeArgs extends scrapeArgs {
    type: 'show';
    data: MovieDB.Responses.TV.GetDetails;
    season: number;
    episode: number;
}

interface filmscrapeArgs extends scrapeArgs {
    type: 'movie';
    data: MovieDB.Responses.Movie.GetDetails;
}

export async function Init() {
    for (const key of Object.keys(downloaders)) {
        delete downloaders[parseInt(key)];
    }
    const downloads = await db.getAllDownloads()
    for (const download of downloads) {
        if(download.id == -1) continue;
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        const cmd = new DownloadCommand(download.url, download.dest, download.name, ()=>{}, {}, download.type, download.id)
        if(download.scrapeArgs){
            cmd.scrapeArgs = download.scrapeArgs
        }
    }
    console.log('Downloads Initialized');
}

export const downloaders: Record<number, DownloadCommand> = {}

export default class DownloadCommand {
    downloader: Downloader | undefined
    _scrapeArgs: showscrapeArgs | filmscrapeArgs | undefined

    get scrapeArgs() {
        return this._scrapeArgs
    }

    set scrapeArgs(val: showscrapeArgs | filmscrapeArgs | undefined) {
        this._scrapeArgs = val
        if(this.id != -1)
            db.updateDownloadById(this.id, this.toJSON('scheduled'));
        else setTimeout(()=> {
            db.updateDownloadById(this.id, this.toJSON('scheduled'));
        }, 500)
    }

    constructor(private videoURL: string, private dest: string, private name: string, private cb: (success: boolean) => void, captionURLs: Record<string, string>, private type: DownloadType, private id: number = -1) {
        if(!fs.existsSync(dest)) fs.mkdirSync(dest, {recursive: true, mode: 0o777})
        if(this.id == -1) {
            db.addDownloadCommand(this.toJSON('scheduled')).then(id => {
                this.id = id
                console.log('New Download: ' + id)
                this.init()
            });
        }
        else this.init()
        this.downloadCaptions(captionURLs)

    }

    init() { 
        try {
            const filepath = join(this.dest, this.name + extname(this.videoURL.split('?')[0]))
            if(this.type == 'hls'){
                this.downloader = new HlsDownloader(this.videoURL, filepath)
            } else {
                this.downloader = new FileDownloader(this.videoURL, filepath)
            }
            this.downloader.init().then((success) => {
                this.cb(success)
            })
            downloaders[this.id] = this
        } catch (e) {
            this.cb(false)
        }
    }

    async startDownload(retries = 0): Promise<boolean> {
        if(retries > 5) {
            db.updateDownloadById(this.id, {...this.toJSON('error'), error: 'Failed to complete download after 5 retries'})
            return false
        }
        if(!this.downloader) return false
        const state = (await db.getDownloadById(this.id)).state
        if(state === 'scheduled'){
            db.updateDownloadById(this.id, this.toJSON('inProgress'))
            Logger.log(`Starting Download ${this.name}`);
            this.downloader.start((p) => {
                db.updateDownloadById(this.id, {
                    ...this.toJSON('inProgress'),
                    progress: p.percent
                })
            }).then(() => {
                db.updateDownloadById(this.id, this.toJSON('complete'))
            }).catch((err) => {
                Logger.error(err);
                this.reScrape().then(() => {
                    Logger.log("Re-scrape successfull");
                    this.init();
                    setTimeout(() => {
                        this.startDownload(retries + 1)
                    }, 100);
                }).catch(err=> {
                    db.updateDownloadById(this.id, {...this.toJSON('error'), error: new Error('Error during re-scrape: ' + err) });
                    Logger.error(err);
                })
            })
        }
        return false
    }

    async downloadCaptions(captionURLs: Record<string, string>) {
        for (const caption of Object.keys(captionURLs)) {
            const res = await axios.get(captionURLs[caption], {responseType: 'text'})
            fs.writeFileSync(join(this.dest, this.name + '-' + caption + extname(captionURLs[caption])), res.data, {mode: 0o777})
        }
    }

    cancel(): void {
        this.downloader?.cancel()
        db.updateDownloadById(this.id, this.toJSON('error'))
    }

    toJSON(state: 'complete' | 'pause' | 'error' | 'scheduled' | 'inProgress'): IDownloadCommand {
        return {
            url: this.videoURL,
            name: this.name,
            dest: this.dest,
            id: this.id,
            type: this.type,
            scrapeArgs: this.scrapeArgs,
            state
        }
    }

    async reScrape(){
        if(!this.scrapeArgs) throw new Error('No scrapeArgs');
        let source: RunOutput | null;
        if(this.scrapeArgs.type == 'movie') {
            source = await ScrapeMovie(this.scrapeArgs.data, this.scrapeArgs.source)
            if(!source) throw new Error("Source " + this.scrapeArgs.source + " hasn't got movie " + this.scrapeArgs.data.title);
            
        } else {
            source = await scrapeEpisode(this.scrapeArgs.data, this.scrapeArgs.season, this.scrapeArgs.episode, this.scrapeArgs.source);
            if(!source) throw new Error("Source " + this.scrapeArgs.source + " hasn't got episode " + this.scrapeArgs.episode);
        }
        const stream = source.stream;
        if(stream.type == 'file'){
            const src = stream.qualities[this.scrapeArgs.quality]
            if (!src) throw new Error('No source found for quality ' + this.scrapeArgs.quality);
            this.videoURL = src.url
        } else if(stream.type == 'hls') {
            const playlist = await axios.get(stream.playlist, {responseType: 'text'}).catch(() => {throw new Error('Failed to get playlist')})
            if(!playlist.data) throw new Error('Failed to get playlist')
            const qualities = parseHlsQuality(playlist.data, stream.playlist)
            const quality = qualities[this.scrapeArgs.quality]
            if (!quality) throw new Error('No source found for quality ' + this.scrapeArgs.quality);
            this.videoURL = quality
        }
    }
}
