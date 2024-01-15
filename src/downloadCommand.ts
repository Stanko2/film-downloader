import fs from 'fs'
import db from "./db";
import { extname, join } from "path"
import fetch from 'node-fetch'
import { Downloader } from "./downloaders";
import FileDownloader from "./downloaders/file-download";
import HlsDownloader from "./downloaders/hls-download";

type DownloadType = 'hls' | 'file'

export interface IDownloadCommand {
    url: string
    dest: string
    name: string
    state: 'complete' | 'pause' | 'error' | 'scheduled' | 'inProgress';
    id: number
    type: 'hls' | 'file'
    error?: Error
    progress?: number
}

export async function Init() {
    console.log('Initializing Downloads');
    
    for (const key of Object.keys(downloaders)) {
        delete downloaders[parseInt(key)];
    }
    const downloads = await db.getAllDownloads()
    console.log(downloads.length);
    
    for (const download of downloads) {
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        new DownloadCommand(download.url, download.dest, download.name, ()=>{}, {}, download.type, download.id)
    }
}

export const downloaders: Record<number, DownloadCommand> = {}

export default class DownloadCommand {
    downloader: Downloader | undefined
    constructor(private videoURL: string, private dest: string, private name: string, private cb: (success: boolean) => void, captionURLs: Record<string, string>, private type: DownloadType, private id: number = -1) {
        if(!fs.existsSync(dest)) fs.mkdirSync(dest, {recursive: true, mode: 0o777})
        if(this.id == -1) {
            db.addDownloadCommand(this.toJSON('scheduled')).then(id => {
                this.id = id
                this.init()
            });
        }
        else this.init()
        this.downloadCaptions(captionURLs)

    }

    init() {
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
    }

    async startDownload(): Promise<boolean> {
        if(!this.downloader) return false
        const state = (await db.getDownloadById(this.id)).state
        if(state === 'scheduled'){
            db.updateDownloadById(this.id, this.toJSON('inProgress'))
            console.log(`Starting Download ${this.name}`);
            this.downloader.start((p) => {
                db.updateDownloadById(this.id, {
                    ...this.toJSON('inProgress'),
                    progress: p.percent
                })
            }).then(() => {
                db.updateDownloadById(this.id, this.toJSON('complete'))
            }).catch((err: Error) => {
                db.updateDownloadById(this.id, {...this.toJSON('error'), error: err });
                console.error(err.message);
            })
        }
        return false
    }

    async downloadCaptions(captionURLs: Record<string, string>) {
        for (const caption of Object.keys(captionURLs)) {
            const res = await fetch(captionURLs[caption])
            fs.writeFileSync(join(this.dest, this.name + '-' + caption + extname(captionURLs[caption])), await res.text(), {mode: 0o777})
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
            state
        }
    }

}

