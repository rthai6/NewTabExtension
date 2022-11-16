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

const loadBookmarks = (root) => {
    const bookmarks = document.getElementById("bookmarks");
    const rootList = document.createElement("ul");
    rootList.classList.add("bookmark-list");
    bookmarks.appendChild(rootList);

    console.log(root);
    const queue = [[rootList, root[0]]];
    while (queue.length) {
        const [parent, node] = queue.shift();
        const rootItem = document.createElement("li");
        if (node.children) {
            rootItem.classList.add("bookmark-folder");

            const span = document.createElement("span");
            span.classList.add("bookmark-folder-text");
            const text = document.createTextNode(`📁${node.title}`);
            span.addEventListener("click", (e) => {
                e.currentTarget.parentElement.querySelector(".hidden").classList.toggle("active");
            });
            span.appendChild(text);
            rootItem.appendChild(span);

            const list = document.createElement("ul");
            list.classList.add("bookmark-list");
            list.classList.add("hidden");
            rootItem.appendChild(list);
            node.children.map((n) => {
                queue.push([list, n]);
            })
        }
        else {
            const link = document.createElement("a");
            link.setAttribute("href", node.url);
            rootItem.appendChild(link);
            const text = document.createTextNode(node.title);
            link.appendChild(text);
        }
        parent.appendChild(rootItem);
    }
}

const loadGrid = () => {
    const rows = localStorage.getItem("rows");
    const columns = localStorage.getItem("columns");
    const grid = document.getElementById("widget-grid");
    grid.style.gridTemplateRows = "1fr ".repeat(rows);
    grid.style.gridTemplateColumns = "1fr ".repeat(columns);

    chrome.bookmarks.getTree((results) => {
        loadBookmarks(results);
    })

    findFirstLivestream().then((url) => {
        if (url) {
            const stream = document.getElementById("stream");
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

    // todo: parallel promises
    initializeElement("header-links-list", "");
    initializeElement("rows", 2);
    initializeElement("columns", 2);
    initializeElement("stream-list", "");
}

const loadHeader = () => {
    const headerLinksList = localStorage.getItem("header-links-list");
    if (headerLinksList) {
        const urls = headerLinksList.split(/\r?\n|\r|\n/g);
        const links = document.getElementById("header-links");
        for (const url of urls) {
            const link = document.createElement("a");
            link.setAttribute("href", url);
            const text = document.createTextNode(url);
            link.appendChild(text);
            links.appendChild(link);
        }
    }
}

window.addEventListener("DOMContentLoaded", async () => {
    loadHeader();
    loadGrid();
    loadOptions();
})