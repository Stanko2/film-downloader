import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import {existsSync, createReadStream, createWriteStream, WriteStream} from 'fs';
import { ffprobe } from 'fluent-ffmpeg';
import { DownloadProgress, Downloader } from '.';
import axios from 'axios';

export default class HlsDownloader extends Downloader  {
    resumable = true
    downloaded = 0
    size = 0
    queue: Promise<void>[] = []
    segmentsDir = ''
    constructor(protected url: string, protected filename: string) {
        super(url, filename)
    }

    async init(): Promise<boolean> {
        const res = await axios.head(this.url, {
            method: 'HEAD',
            headers: {
                Accept: '*/*',
                'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:89.0) Gecko/20100101 Firefox/89.0'
            }
        }).catch(() => undefined)
        if(!res) return false
        const file = this.filename.split('/').pop()?.split('.')[0] || ''
        const dir = this.filename.split('/').slice(0, -1).join('/')
        this.segmentsDir = path.join(dir, 'segments-' + file.replaceAll(' ', '-'));
        fs.mkdir(this.segmentsDir, {recursive: true});
        return true
    }

    override async startDownload(progressCallback: (progress: DownloadProgress) => void): Promise<void> {
        const file = this.filename.split('/').pop() || ''
        const dir = this.filename.split('/').slice(0, -1).join('/')
        const segments = await this.getSegments(this.url)
        const baseUrl = this.url.split('/').slice(0, -1).join('/')

        let done = 0
        console.log(`downloading ${segments.length} segments`);
        const paths: string[] = []
        for (const segment of segments) {
            if(HlsDownloader.filesProcessing.has(segment)) return
            HlsDownloader.filesProcessing.add(segment);
            const p = path.join(this.segmentsDir, segment)
            paths.push(p)
            
            if (existsSync(p)) {
                done++
                progressCallback({
                    downloaded: done,
                    total: segments.length,
                    percent: (done / segments.length) * 100
                })
                
                continue
            }
            this.queue.push(this.downloadSegment(baseUrl, segment, p).then(()=> {
                done++
                progressCallback({
                    downloaded: done,
                    total: segments.length,
                    percent: (done / segments.length) * 100
                })            
            }).catch(err => {
                throw err
            }))

            if (this.queue.length > 10) {
                await Promise.all(this.queue)
                this.queue.splice(0, this.queue.length)
                await new Promise(r => setTimeout(r, 1000))
            }
        }

        await Promise.all(this.queue)

        if (HlsDownloader.filesProcessing.has(file)) return
        HlsDownloader.filesProcessing.add(file)
        this.resumable = false
        await this.mergeSegments(dir, file.split('.')[0], paths)
        console.log(`Finished Download ${this.name}`)
    }

    async getSegments(playlistURL: string): Promise<string[]> {
        const manifest = (await axios.get(playlistURL, {
            responseType: 'text'
        })).data
        const out: string[] = []
        const lines = manifest.split('\n')
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if(line.startsWith('#EXTINF:')){
                const segment = lines[i+1]
                out.push(segment)
            }
        }
    
        return out
    }
    

    override cancel(): void {
        this.queue.forEach(e => e.catch(()=>undefined))
        this.queue = []
    }


    async fileToStream(file: string, out: WriteStream): Promise<void> {
        return new Promise((resolve, reject) => {
            const stream = createReadStream(file)
            stream.on('end', () => {
                resolve()
            })
            stream.on('error', (err) => {
                reject(err)
            })
            stream.pipe(out, {end: false})
        })
        
    }

    async mergeSegments(dest: string, name: string, paths: string[]) {

        const stream = createWriteStream(name + '.mp4')
        for (const file of paths) {
            await this.fileToStream(file, stream)
        }
        return new Promise<void>((resolve, reject) => {
            stream.end(() => {
                ffprobe(name + '.mp4', async (err, data) => {
                    if(err) reject(err)
                    const include: string[] = []
                    for (const stream of data.streams) {
                        if (stream.codec_type == 'video') {
                            include.push('-map', `0:${stream.index}`)
                        }
                        else if (stream.codec_type == 'audio') {
                            include.push('-map', `0:${stream.index}`)
                        }
                    }
                    const args = [
                        '-y',
                        '-i', `'./${name}.mp4'`,
                        ...include,
                        '-c', 'copy',
                        `'./${name}.final.mp4'`
                    ]
                    console.log(args.join(' '));
                    const ffmpeg = spawn('ffmpeg', args, {cwd: process.cwd(), shell: true})
                    ffmpeg.stdout.on('data', (data) => {
                        console.log(data.toString());
                    })
                    ffmpeg.stderr.on('data', (data) => {
                        console.error(data.toString());
                    })
                    ffmpeg.on('close', async (code) => {
                        if (code != 0) {
                            reject(code)
                        }
                        else {
                            await fs.copyFile(`${name}.final.mp4`, `${dest}/${name}.mp4`);
                            await fs.rm(`${name}.mp4`);
                            await fs.rm(`${name}.final.mp4`);
                            await this.removeSegments()
                            resolve()
                        }
                    })
                });
            })
    
        })
    }
    

    async removeSegments() {
        const files = await fs.readdir(this.segmentsDir);
        for (const file of files) {
            await fs.rm(path.join(this.segmentsDir, file))
        }

        await fs.rm(this.segmentsDir)
    }

    async downloadSegment(url: string, segName: string, dest: string, retry = 0) {
        // eslint-disable-next-line no-async-promise-executor
        return new Promise<void>(async (resolve, reject) => {
            const timeout = setTimeout(async () => {
                if(retry < 10) 
                    this.downloadSegment(url, segName, dest, retry + 1).then(resolve).catch(reject);
            }, 4000);
            await fs.writeFile(dest, Buffer.from(''))
            const res = await axios.get(url + '/' + segName, {responseType: 'arraybuffer'}).catch(reject)
            const buf = res?.data
            clearTimeout(timeout)
            if(buf)
                await fs.writeFile(dest, Buffer.from(buf)).catch(reject)
            resolve()
        })
    }
}
