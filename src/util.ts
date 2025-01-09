import { Qualities } from "./providerLib";
import { ffprobe } from "fluent-ffmpeg";
import db from "./db";


const videoExtensions = ['m4v', 'avi','mpg','mp4', 'webm', 'mov', 'mkv']

/**
 * Format bytes as human-readable text.
 *
 * @param bytes Number of bytes.
 * @param si True to use metric (SI) units, aka powers of 1000. False to use
 *           binary (IEC), aka powers of 1024.
 * @param dp Number of decimal places to display.
 *
 * @return Formatted string.
 */
export function humanFileSize(bytes: number, si=false, dp=1) {
    const thresh = si ? 1000 : 1024;

    if (Math.abs(bytes) < thresh) {
      return bytes + ' B';
    }

    const units = si
      ? ['kB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']
      : ['KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB'];
    let u = -1;
    const r = 10**dp;

    do {
      bytes /= thresh;
      ++u;
    } while (Math.round(Math.abs(bytes) * r) / r >= thresh && u < units.length - 1);


    return bytes.toFixed(dp) + ' ' + units[u];
  }

export function parseHlsQuality(file: Buffer, url: string): Partial<Record<Qualities, string>> {
  const lines = file.toString('utf-8').split('\n')
  const out: Partial<Record<Qualities, string>> = {}
  const bandwidths: Partial<Record<Qualities, number>> = {};
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if(line.startsWith('#EXT-X-STREAM-INF')){
      // console.log(line)
      const bandwidth = line.match(/BANDWIDTH=(\d+)/)?.[1]
      // console.log(bandwidth)
      if(line.match('1080') && (bandwidths['1080'] ?? 0) <= parseInt(bandwidth || '0')){
        out['1080'] = getUrl(lines[i+1], url);
        bandwidths['1080'] = parseInt(bandwidth || '0')
      }
      else if(line.match('720') && (bandwidths['720'] ?? 0) <= parseInt(bandwidth || '0')){
        out['720'] = getUrl(lines[i+1], url)
        bandwidths['720'] = parseInt(bandwidth || '0')
      }
      else if(line.match('480') && (bandwidths['480'] ?? 0) <= parseInt(bandwidth || '0')){
        out['480'] = getUrl(lines[i+1], url)
        bandwidths['480'] = parseInt(bandwidth || '0')
      }
      else if(line.match('2160') && (bandwidths['4k'] ?? 0) <= parseInt(bandwidth || '0')){
        out['4k'] = getUrl(lines[i+1], url)
        bandwidths['4k'] = parseInt(bandwidth || '0')
      }
      else if(line.match('360') && (bandwidths['360'] ?? 0) <= parseInt(bandwidth || '0')){
        out['360'] = getUrl(lines[i+1], url)
        bandwidths['360'] = parseInt(bandwidth || '0')
      }
    }
  }
  return out
}

export function getUrl(row: string, url: string) {
  if(row.startsWith('http')) {
    return row
  }
  const stripped = url.split('/').slice(0, -1).join('/');
  return stripped + '/' + row
}

export function compareQualities(a: Qualities, b: Qualities): number {
  const qualities: Qualities[] = ['4k', '1080', '720', '480', '360']
  return qualities.indexOf(a) - qualities.indexOf(b)
}


export function IsVideo(name: string): boolean {
  return videoExtensions.some(ext => name.endsWith(ext))
}


export async function getStreamMetadata(file: string, name: string) {
  const cached = await db.client.get('streamData:'+file);
  if(cached) {
    return JSON.parse(cached)
  }
  return new Promise((resolve, reject) => {
    ffprobe(file, (err, data)=> {
      if(err){
        reject(err);
      }
      else {
        resolve({
          name,
          resolution: {
            width: data.streams.find(s => s.codec_type === 'video')?.coded_width,
            height: data.streams.find(s => s.codec_type === 'video')?.coded_height
          },
          metadata: {
            size: humanFileSize(data.format.size || 0, true, 2),
            bit_rate: humanFileSize(data.format.bit_rate || 0),
            duration: new Date((data.format.duration || 0) * 1000).toTimeString().substring(0, 8)
          }
        })
      }
    })
  }).then((data) => {
    db.client.set('streamData:'+file, JSON.stringify(data))
    return data
  })
}

export function parseFileName(name: string): [string, number | undefined] {
  const match = name.match(/(.*) \((\d{4})\)/)
  if(match) {
    return [match[1], parseInt(match[2])]
  }
  return [name, undefined]
}

export function parseSeasonEpisode(name: string): [number, number] | undefined {
  const match = name.match(/S(\d{2})E(\d{2})/)
  if(match) {
    return [parseInt(match[1]), parseInt(match[2])]
  }
  return undefined
}
