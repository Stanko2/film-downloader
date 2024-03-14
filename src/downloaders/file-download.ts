import fs from 'fs'
import axios from 'axios'
import { DownloadProgress, Downloader } from '.'
import { Logger } from '../logger'

export default class FileDownloader extends Downloader {
    resumable = false
    downloaded = 0
    size = 0
    downloadStream: fs.WriteStream | undefined
    constructor(protected url: string, protected filename: string) {
        super(url, filename)
    }

    async init(): Promise<boolean> {
        const res = await axios.head(this.url).catch(() => undefined)
        if(!res) return false
        this.size = res.headers['content-length']
        if(!this.size) {
            return false
        }
        this.resumable = res.headers['accept-ranges'] === 'bytes'
        return true
    }

    override async startDownload(progressCallback: (progress: DownloadProgress) => void): Promise<void> {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const that = this
        if(fs.existsSync(this.filename)) {
            this.downloaded = fs.statSync(this.filename).size
        } else {
            this.downloaded = 0
        }
        const res = await axios.get(this.url, {
            responseType: 'stream',
            headers: {
                'Range': `bytes=${this.downloaded}-`,
                Accept: '*/*',
                'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:89.0) Gecko/20100101 Firefox/89.0'
            },
            onDownloadProgress(progressEvent) {
                progressCallback({
                    downloaded: that.downloaded + progressEvent.loaded,
                    total: that.size,
                    percent: (progressEvent.loaded / (progressEvent.total ?? that.size) * 100)
                })
            },
        }).catch((err) => {
            throw new Error(err);
        })
        if(res.status >= 400)
            throw new Error("Request failed with status " + res.status);

        this.downloadStream = fs.createWriteStream(this.filename, {mode: 0o777, flags: 'a'})
        res.data.pipe(this.downloadStream)
        return new Promise<void>((resolve, reject) => {
            this.downloadStream?.on('finish', () => {
                Logger.log(`Finished Download ${this.name}`)
                resolve()
            })
            this.downloadStream?.on('error', (err) => {
                console.log(`Error Downloading ${this.name}`)
                reject(err)
            })
        })

    }

    override cancel(): void {
        this.downloadStream?.close()
        this.downloadStream?.destroy()
        this.downloadStream = undefined
    }
}