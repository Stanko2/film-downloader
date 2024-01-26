import TMDB from 'node-themoviedb'
import db from './db';
import MovieDB from 'node-themoviedb';

let api: TMDB | undefined;

export function init() {
    const key = process.env.TMDB_KEY
    if (key)
        api = new TMDB(key)
    else
        throw new Error('No tmdb api key')

}

export async function searchMovie(query: string, year: number | undefined) {
    if(!api){
        throw new Error('TMDB API not initialized')
    }

    const res = await api.search.movies({
        query: {
            query,
            year
        }
    })

    return res.data.results
    
}

export async function getMovieFromID(id: string): Promise<MovieDB.Responses.Movie.GetDetails> {
    if(!api){
        throw new Error('TMDB API not initialized')
    }

    const cached = await db.client.get('tmdbDataMovies:'+id);
    if (cached) {
        return JSON.parse(cached);
    }
    
    const res = await api.movie.getDetails({
        pathParameters: {
            movie_id: id
        }
    })

    db.client.set('tmdbDataMovies:'+id, JSON.stringify(res.data))
    return res.data
}

export async function getTvShowFromID(id: string): Promise<MovieDB.Responses.TV.GetDetails> {
    if(!api){
        throw new Error('TMDB API not initialized')
    }
    
    const cached = await db.client.get('tmdbDataTV:'+id);
    if (cached) {
        return JSON.parse(cached);
    }

    const res = await api.tv.getDetails({
        pathParameters: {
            tv_id: id
        }
    })
    
    db.client.set('tmdbDataTV:'+id, JSON.stringify(res.data))
    return res.data
}



export async function searchSeries(query: string) {
    if(!api){
        throw new Error('TMDB API not initialized')
    }

    

    const res = await api.search.TVShows({
        query: {
            query,
        }
    })

    return res.data.results
}

export async function getSeasonDetails(id: string, season: number, episode: number): Promise<MovieDB.Responses.TV.Episode.GetDetails> {
    if(!api){
        throw new Error('TMDB API not initialized')
    }

    const cached = await db.client.get('tmdbDataSeason:'+id+':'+season+':'+episode);
    if (cached) {
        return JSON.parse(cached);
    }

    const res = await api.tv.episode.getDetails({
        pathParameters: {
            tv_id: id,
            season_number: season,
            episode_number: episode
        }
    })

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    delete res.data.crew;
    
    await db.client.set('tmdbDataSeason:'+id+':'+season+':'+episode, JSON.stringify(res.data))

    return res.data
}

export async function getMovieImages(movie_id: string) {
    if(!api){
        throw new Error('TMDB API not initialized')
    }

    return api.movie.getImages({
        pathParameters: {
            movie_id
        }
    })
}