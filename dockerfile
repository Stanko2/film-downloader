# Dockerfile
FROM node:18
# Or whatever Node version/image you want
WORKDIR '/var/www/app'

RUN apt-get -y update
RUN apt-get -y upgrade
RUN apt-get install -y ffmpeg