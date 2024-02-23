import fs from 'fs'
import axios from 'axios'
import { DownloadProgress, Downloader } from '.'

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
                    percent: (progressEvent.loaded / (progressEvent.total ?? this.size) * 100)
                })
            },
        }).catch((err) => {
            throw new Error(err);
        })
        console.log(res.headers['Content-Range']);
        
        
        this.downloadStream = fs.createWriteStream(this.filename, {mode: 0o777, flags: 'a'})
        res.data.pipe(this.downloadStream)
        return new Promise<void>((resolve, reject) => {
            this.downloadStream?.on('finish', () => {
                console.log(`Finished Download ${this.name}`)
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