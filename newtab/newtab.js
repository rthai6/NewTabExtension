"use strict";

const parser = new DOMParser();
const urlToDocument = async (url) => {
    const response = await fetch(url);
    const text = await response.text();
    return parser.parseFromString(text, "text/html");
}

// https://stackoverflow.com/questions/32454238/how-to-check-if-youtube-channel-is-streaming-live
const getLivestream = async (channelUrl) => {
    const live = await urlToDocument(`${channelUrl}/live`);

    const canonicalURLTag = live.querySelector('link[rel=canonical]')
    const canonicalURL = canonicalURLTag.getAttribute('href')
    const isStreaming = canonicalURL.includes('/watch?v=')
    if (!isStreaming) return;

    const redirect = await urlToDocument(canonicalURL);
    const startDateString = redirect.querySelector("meta[itemprop=startDate]")?.getAttribute("content");
    const startDate = new Date(startDateString);
    const currentTime = new Date();
    if (currentTime < startDate) return;

    return canonicalURL;
}

const findFirstLivestream = async () => {
    const streamList = localStorage.getItem("stream-list");
    if (streamList) {
        const urls = streamList.split(/\r?\n|\r|\n/g);
        if (urls.length) {
            for (const channel of urls) {
                const liveUrl = await getLivestream(channel);
                if (liveUrl) {
                    const params = new URLSearchParams(new URL(liveUrl).search);
                    const videoId = params.get("v");
                    return `https://www.youtube.com/embed/${videoId}`;
                }
            }
        }
    }
}

const loadGrid = () => {
    const rows = localStorage.getItem("rows");
    const columns = localStorage.getItem("columns");
    var grid = document.getElementById("widget-grid");
    grid.style.gridTemplateRows = "1fr ".repeat(rows);
    grid.style.gridTemplateColumns = "1fr ".repeat(columns);

    var folders = document.getElementsByClassName("bookmark-folder");
    for (const folder of folders) {
        folder.querySelector("span").addEventListener("click", (e) => {
            e.currentTarget.parentElement.querySelector(".hidden").classList.toggle("active");
        });
    }
    findFirstLivestream().then((url) => {
        if (url) {
            var stream = document.getElementById("stream");
            stream.setAttribute("src", url)
        }
        else {
            // todo: handle no livestream
        }
    });
}

const initializeElement = (id, defaultValue) => {
    const data = localStorage.getItem(id);
    const element = document.getElementById(id);
    element.value = data ?? defaultValue;
    element.addEventListener("input", (e) => {
        localStorage.setItem(id, e.currentTarget.value);
    })
}

const loadOptions = () => {
    const modal = document.getElementById("options-modal");
    document.getElementById("options").addEventListener("click", () => {
        modal.classList.add("active");
    })
    document.getElementById("options-modal-close").addEventListener("click", () => {
        modal.classList.remove("active");
    })

    initializeElement("rows", 2);
    initializeElement("columns", 2);
    initializeElement("stream-list", "");
}

window.addEventListener("DOMContentLoaded", async () => {
    loadGrid();
    loadOptions();
})