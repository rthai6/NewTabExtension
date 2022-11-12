"use strict";

const parser = new DOMParser();
async function urlToDocument(url) {
    const response = await fetch(url);
    const text = await response.text();
    return parser.parseFromString(text, "text/html");
}

// https://stackoverflow.com/questions/32454238/how-to-check-if-youtube-channel-is-streaming-live
async function getLivestream(channelUrl) {
    const html = await urlToDocument(`${channelUrl}/live`);
    const startDateString = html.querySelector("meta[itemprop=startDate]")?.getAttribute("content");
    if (!startDateString) return;

    const startDate = new Date(startDateString);
    const currentTime = new Date();
    if (currentTime < startDate) return;

    const canonicalURLTag = html.querySelector('link[rel=canonical]')
    const canonicalURL = canonicalURLTag.getAttribute('href')

    return canonicalURL;
}

window.onload = async () => {
    var stream = document.getElementById("stream");
    const streamList = localStorage.getItem("streamList");
    if (streamList) {
        const urls = streamList.split(/\r?\n|\r|\n/g);
        if (urls.length) {
            for (const channel of urls) {
                const liveUrl = await getLivestream(channel);
                if (liveUrl) {
                    const params = new URLSearchParams(new URL(liveUrl).search);
                    const videoId = params.get("v");
                    stream.setAttribute("src", `https://www.youtube.com/embed/${videoId}?autoplay=1`)
                    break;
                }
            }
        }
    }
}