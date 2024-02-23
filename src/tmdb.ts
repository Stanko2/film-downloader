import TMDB from 'node-themoviedb'
import db from './db';
import MovieDB from 'node-themoviedb';
import { Logger } from './logger';

export let api: TMDB | undefined;

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
    }).catch((err) => {
        throw new Error("Error searching movies: " + err.message);  
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
    }).catch((err) => {
        throw new Error("Error getting movie details: " + err.message);  
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
    }).catch((err) => {
        throw new Error("Error getting tv show details: " + err.message);  
    })
    
    db.client.set('tmdbDataTV:'+id, JSON.stringify(res?.data))
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
    }).catch((err) => {
        throw new Error("Error searching series: " + err.message);  
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
    }).catch((err) => {
        throw new Error("Error getting episode details: " + err.message);  
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

export async function getWatchlist(): Promise<{movies: MovieDB.Objects.Movie[], shows: MovieDB.Objects.TVShow[]}> {
    if(!api){
        throw new Error('TMDB API not initialized')
    }
    const session_id = await db.getTMDBSessionId()
    if (!session_id) {
        throw new Error('No session id')
    }

    const movies = api.account.getMovieWatchlist({
        pathParameters: {
            account_id: 0
        },
        query: {
            session_id,
            sort_by: 'created_at.asc',
        }
    }).catch((err) => {
        Logger.error(err);
    })

    const shows = api.account.getTVShowWatchlist({
        pathParameters: {
            account_id: 0
        },
        query: {
            session_id,
            sort_by: 'created_at.asc',
        }
    }).catch((err) => {
        Logger.error(err);
    })

    return {
        movies: (await movies)?.data.results || [],
        shows: (await shows)?.data.results || []
    }
}

export async function getImdbId(id: string, type: 'movie' | 'tv') {
    if(!api){
        throw new Error('TMDB API not initialized')
    }

    if(type === 'movie') {
        const res = await api.movie.getExternalIDs({
            pathParameters: {
                movie_id: id
            }
        })
        return res.data.imdb_id
    } else {
        const res = await api.tv.getExternalIDs({
            pathParameters: {
                tv_id: id
            }
        })
        return res.data.imdb_id
    }

}