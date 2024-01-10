import { DownloaderHelper } from "node-downloader-helper";
import fs from 'fs'
import db from "./db";
import { extname, join } from "path"
import { downloadHls } from "./hls-download";
import fetch from 'node-fetch'

type DownloadType = 'hls' | 'file'

export interface DownloadCommand {
    url: string
    dest: string
    name: string
    state: 'complete' | 'pause' | 'error' | 'scheduled' | 'inProgress';
    id: number
    type: 'hls' | 'file'
    error?: string
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
        new Downloader(download.url, download.dest, download.name, ()=>{}, {}, download.type, download.id)
    }
}

export const downloaders: Record<number, Downloader> = {}

export default class Downloader {
    downloader!: DownloaderHelper
    constructor(private videoURL: string, private dest: string, private name: string, private cb: (success: boolean) => void, captionURLs: Record<string, string>, private type: DownloadType, private id: number = -1) {
        if(!fs.existsSync(dest)) fs.mkdirSync(dest, {recursive: true, mode: 0o777})
        if(this.id == -1) {
            db.addDownloadCommand(this.toDownloadCommand('scheduled')).then(id => {
                this.id = id
                this.init()
            });
        }
        else this.init()
        this.downloadCaptions(captionURLs)

    }

    init() {
        if(this.type == 'file'){
            this.initFile()
        } else {
            this.initHls()
        }
        downloaders[this.id] = this
    }

    async startDownload(): Promise<boolean> {
        const state = (await db.getDownloadById(this.id)).state
        if(state === 'scheduled'){
            db.updateDownloadById(this.id, this.toDownloadCommand('inProgress'))
            console.log(`Starting Download ${this.name}`);
            if(this.type == 'file'){
                return await this.downloader.start()
            } else {
                return downloadHls(this.videoURL, this.dest, this.name, (progress) => {
                    const data = this.toDownloadCommand('inProgress')
                    data.progress = progress
                    db.updateDownloadById(this.id, data)
                }).then(() => {
                    db.updateDownloadById(this.id, this.toDownloadCommand('complete'))
                    console.log(`Finished Download ${this.name}`)
                    return true
                }).catch(() => false)
            }
        }
        return false
    }

    initFile() {
        this.downloader = new DownloaderHelper(this.videoURL, this.dest, {
            fileName: this.name + extname(this.videoURL.split('?')[0])
        })
        this.downloader.getTotalSize().then((res)=>{
            this.cb(res.total != null)
            if(res.total){
                if(this.id == -1){
                    db.addDownloadCommand(this.toDownloadCommand('scheduled')).then(id => this.id = id)
                }
            }
        }).catch((e)=>{
            console.error(e);
            this.cb(false)
        })
        this.downloader.on('error', (s)=>{
            console.error(s);
            const data = this.toDownloadCommand('error')
            data.error = s.message
            db.updateDownloadById(this.id, data)
        })
        this.downloader.on('progress', (s) => {
            if(s.progress == 100){
                db.updateDownloadById(this.id, this.toDownloadCommand('complete'))
            }
            else {
                const data = this.toDownloadCommand('inProgress')
                data.progress = s.progress
                db.updateDownloadById(this.id, data)
            }
        })
    }

    async initHls() {
        await fetch(this.videoURL).catch(() => this.cb(false)).then(()=> this.cb(true))
    }

    async downloadCaptions(captionURLs: Record<string, string>) {
        for (const caption of Object.keys(captionURLs)) {
            const res = await fetch(captionURLs[caption])
            fs.writeFileSync(join(this.dest, this.name + '-' + caption + extname(captionURLs[caption])), await res.text(), {mode: 0o777})
        }
    }

    cancel(): void {
        db.updateDownloadById(this.id, this.toDownloadCommand('error'))
    }

    toDownloadCommand(state: 'complete' | 'pause' | 'error' | 'scheduled' | 'inProgress'): DownloadCommand {
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

