# Film Downloader

Simple server to scrape, index, and download movies from the web. You can use this on your home server to download movies and stream them to your local devices. You can watch your downloaded movies in a browser or use a media player like KODI to stream them.

## Installation

Installation is really simple. You just need to launch docker container.

### 1. setup environment variables

Copy `docker-compose.example.yml` to `docker-compose.yml` and set environment variables. The required ones are:
 - `TMDB_KEY`: API key for TMDB. You can get one [here](https://www.themoviedb.org/settings/api) for free.
 - `BASE_URL`: Base URL for the server. This is used for TMDB login redirect

You can also remove the `redis-commander` service if you don't need to develop it or change database manually. It isn't 
required for the server to work.

### 2. launch docker container

```bash
docker-compose up -d
```

And you are done! You can now access the server. By default, it would be available at `http://<your local IP>:3000`.


## Usage

The first thing you need to do after successfully starting the server is to set movies and TV shows directories. You can do that by clicking on the `Settings` button in the navbar. You can also set how often the server downloads item from queue via the `Download Interval` option. Any valid CRON expression is accepted. You can also login to TMDB to view your watchlist on homepage and download them directly. 


### Adding movies or TV shows

1. Click on the `+` button in the movie library tab.
2. Enter movie name and click on the `Search` button.
3. Select the movie you want to add from the list.
4. Select the quality and caption languages that you want to download.
 - In TV Shows you can also select the episodes you want to download. 
 - Select the source as appropriate. For example `showbox` links expire, so you should select `showbox` as source only if you are going to download the movie immediately. From my experience `zoechip` is the best option.
5. Click on the `Download` button to add the movie to the queue.

### Downloading movies or TV shows

If you want to start the download immediately, you can click on the `Start now` button. Don't bother using the restart button if it gets stuck. Restarting the download will not delete already downloaded chunks. It will also be restarted automatically if it gets stuck for long time.

After download is complete, the movie is not available immediately. You need to click on the `Update Movie Library Cache` button in settings to refresh the movie library and scrape newly downloaded movies. It takes some time so be patient.