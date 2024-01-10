import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import {existsSync, createReadStream, createWriteStream, WriteStream} from 'fs';
import { ffprobe } from 'fluent-ffmpeg';
import fetch from 'node-fetch';

export async function downloadHls(src: string, dest: string, name: string, progressCallback: (progress: number) => void) {
    await fs.mkdir(path.join(dest, 'segments-' + name), { recursive: true, mode: 0o777 });
    const segments = await getSegments(src);

    const baseUrl = src.split('/').slice(0, -1).join('/')
    const ops: Promise<void>[] = []
    let done = 0
    console.log(`downloading ${segments.length} segments`);
    const paths: string[] = []
    for (const segment of segments) {
        const p = path.join(dest, 'segments-' + name, segment)
        paths.push(p)
        
        if (existsSync(p)) {
            done++
            progressCallback?.(done / segments.length)
            
            continue
        }
        ops.push(downloadSegment(baseUrl, segment, p).then(()=> {
            done++
            progressCallback?.(done / segments.length)
            console.log(`downloaded ${done}/${segments.length}`);
            
        }))

        if (ops.length > 10) {
            await Promise.all(ops)
            ops.splice(0, ops.length)
            await new Promise(r => setTimeout(r, 1000))
        }
    }

    await Promise.all(ops)
    // const input = paths.map(e => `file '${e}'`).join('\n')
    // await fs.writeFile(path.join(dest, 'segments-' + name, 'input.txt'), input, {mode: 0o777})

    await mergeSegments(dest, name, paths)
}

async function mergeSegments(dest: string, name: string, paths: string[]) {

    const stream = createWriteStream(name + '.mp4')
    for (const file of paths) {
        await fileToStream(file, stream)
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
                        await fs.rmdir(path.join(dest, 'segments-' + name), {recursive: true})
                        resolve()
                    }
                })
            });
        })

    })
}

async function fileToStream(file: string, out: WriteStream): Promise<void> {
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

async function getSegments(playlistURL: string): Promise<string[]> {
    const manifest = await fetchText(playlistURL)
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

async function fetchText(url: string) {
    const res = await fetch(url)
    return await res.text()
}

async function downloadSegment(url: string, segName: string, dest: string) {
    const res = await fetch(url + '/' + segName)
    const buf =  await res.arrayBuffer()
    await fs.writeFile(dest, Buffer.from(buf))
}