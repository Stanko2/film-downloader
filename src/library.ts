import * as fs from 'fs'
import db from './db'
import { parseFileName } from './util'
import { getMovieFromID, getTvShowFromID, searchMovie, searchSeries } from './tmdb'
import path from 'path'
import MovieDB from 'node-themoviedb'

export function getEpisodeName(season: number, episode: number): string {
  let ret = 'S'
  if (season < 10)
    ret+='0'
  ret+=season.toString() + 'E'
  if (episode < 10)
    ret+='0'
  ret+=episode.toString()
  return ret
}


export function getYear(release_date: string): number {
    return new Date(release_date).getFullYear()
}

async function getAllEntries(mediaType: 'series' | 'films') {
  const location = await db.getSaveLocation(mediaType) 
  if(fs.existsSync(location)){
    const films = fs.readdirSync(location).filter(x => fs.statSync(path.join(location, x)).isDirectory())
    console.log('Found ' + films.length + ' ' + mediaType + ' in library');
    return films
  }
  else throw new Error(mediaType + ' library non-existed or non specified')
}

export async function getAllShows() {
  return await getAllEntries('series')
}

export async function getAllMovies() {
  return await getAllEntries('films')
}

async function getDetails(name: string, mediaType: 'series' | 'films') {
  const [title, year] = parseFileName(name)
  let id = parseInt(await db.client.get(mediaType + ':'+ name.replaceAll(' ', '-')) || 'NaN')
  if(isNaN(id)) {
    const data = mediaType === 'series' ? await searchSeries(title) : await searchMovie(title, year)
    if(data.length == 0) {
      console.log('No data found for ' + name);
      
      return null
    }
    await db.client.set(mediaType + ':'+ name.replaceAll(' ', '-'), data[0].id)
    id = data[0].id
  }
  if(mediaType == 'series') {
    return getTvShowFromID(id.toString())
  } else {
    return getMovieFromID(id.toString())
  }
}

export async function getShowDetails(name: string): Promise<MovieDB.Responses.TV.GetDetails> {
  return await getDetails(name, 'series') as MovieDB.Responses.TV.GetDetails
}

export async function getMovieDetails(name: string): Promise<MovieDB.Responses.Movie.GetDetails> {
  return await getDetails(name, 'films') as MovieDB.Responses.Movie.GetDetails
}
  
export async function reloadLibrary(mediaType: 'series' | 'films') {
  const library: unknown[] = []
  const videos = await getAllEntries(mediaType)
  for (const [i, video] of videos.entries()) {
    const details = await getDetails(video, mediaType).catch((err) => {
      console.error(err);
      return null
    })
    library.push({
      name: video,
      poster: details?.poster_path,
      id: i
    })
  }
  
  db.client.set('Library:' + mediaType, JSON.stringify(library))
}
  
export async function addMovie(id: string, filePath: string, fileExt: string) {
  const location = await db.getSaveLocation('films');
  const data = await getMovieFromID(id)

  const name = data.title + ' (' + getYear(data.release_date) + ')';
  const folder = path.join(location, name)
  if(!fs.existsSync(folder)) {
    fs.mkdirSync(folder)
  }
  console.log('Copying file to ' + folder);
  
  return new Promise<void>((resolve, reject) => {
    fs.copyFile(filePath, path.join(folder, name + fileExt), (err) => {
      if(err) reject(err)
      fs.rm(filePath, (err)=>{
        if(err) reject(err)
        resolve()
      });
    });
  });

}

export async function addEpisode(id: string, filePath: string, fileExt: string, season: number, episode: number) {
  const location = await db.getSaveLocation('series');
  const data = await getTvShowFromID(id)

  const name = data.name + ' (' + getYear(data.first_air_date) + ')';
  const folder = path.join(location, name)
  if(!fs.existsSync(folder)) {
    fs.mkdirSync(folder)
  }
  console.log('Copying file to ' + folder);
  
  return new Promise<void>((resolve, reject) => {
    fs.copyFile(filePath, path.join(folder, name + getEpisodeName(season, episode) + fileExt), (err) => {
      if(err) reject(err)
      fs.rm(filePath, (err)=>{
        if(err) reject(err)
        resolve()
      });
    });
  });
}