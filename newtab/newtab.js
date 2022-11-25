"use strict";

//#region constants
const DEFAULT_ROWS = 2;
const DEFAULT_COLS = 3;

const WIDGET_TYPE_NONE = ""
const WIDGET_TYPE_BOOKMARKS = "bookmarks"
const WIDGET_TYPE_YOUTUBE = "youtube"
const WIDGET_TYPE_YOUTUBE_LIVESTREAM = "stream"
//#endregion

//#region helpers
const getLocalStorage = (key, defaultValue) => JSON.parse(localStorage.getItem(key)) ?? defaultValue;
const setLocalStorage = (key, value) => localStorage.setItem(key, typeof value === "string" ? value: JSON.stringify(value));
const addClass = (element, ...classes) => classes.map((c) => { element.setAttribute("class", c)})
//#endregion

//#region livestreams
let parser = undefined;
const urlToDocument = async (url) => {
    const response = await fetch(url);
    const text = await response.text();
    if (!parser) parser = new DOMParser();
    return parser.parseFromString(text, "text/html");
}

// https://stackoverflow.com/questions/32454238/how-to-check-if-youtube-channel-is-streaming-live
const getLivestream = async (channelUrl) => {
    const live = await urlToDocument(`${channelUrl}/live`);

    // live url gives redirect to livestream if there is one
    const canonicalURLTag = live.querySelector('link[rel=canonical]')
    const canonicalURL = canonicalURLTag.getAttribute('href')
    const isStreaming = canonicalURL.includes('/watch?v=')
    if (!isStreaming) return;

    // it's possible that the livestream hasn't started yet
    const redirect = await urlToDocument(canonicalURL);
    const startDateString = redirect.querySelector("meta[itemprop=startDate]")?.getAttribute("content");
    const startDate = new Date(startDateString);
    const currentTime = new Date();
    if (currentTime < startDate) return;

    return canonicalURL;
}

const getFirstLivestream = async (streamList) => {
    if (!streamList) return;

    const urls = streamList.split(/\r?\n|\r|\n/g);
    if (!urls.length) return;

    const liveUrls = await Promise.all(urls.map((url) => getLivestream(url)));
    for (const liveUrl of liveUrls) {
        if (liveUrl) {
            const params = new URLSearchParams(new URL(liveUrl).search);
            const videoId = params.get("v");
            return `https://www.youtube.com/embed/${videoId}`;
        }
    }

    // Sequential, in case youtube rate limits

    // for (const channel of urls) {
    //     const liveUrl = await getLivestream(channel);
    //     if (liveUrl) {
    //         const params = new URLSearchParams(new URL(liveUrl).search);
    //         const videoId = params.get("v");
    //         return `https://www.youtube.com/embed/${videoId}`;
    //     }
    // }
}
//#endregion

//#region bookmarks
const createBookmarks = (root) => {
    const openBookmarks = getLocalStorage("open-bookmarks", {});

    const rootList = document.createElement("ul");
    rootList.addEventListener("click" , (e) => {
        if (e.target.tagName != "SPAN") return;

        const childList = e.target.parentNode.querySelector('ul');
        if (!childList) return;

        childList.hidden = !childList.hidden;

        const id = e.target.dataset.id;
        // use object because hashset can't be stringified
        const newOpenBookmarks = getLocalStorage("open-bookmarks", {});
        if (!childList.hidden) newOpenBookmarks[id] = null;
        else delete newOpenBookmarks[id];
        setLocalStorage("open-bookmarks", newOpenBookmarks)
    })

    const elements = [];
    createBookmarksHelper(root[0], openBookmarks, elements);
    rootList.innerHTML = elements.join("");;

    return rootList;
}

// https://stackoverflow.com/questions/18393981/append-vs-html-vs-innerhtml-performance
const createBookmarksHelper = (node, openBookmarks, elements) => {
    if (node.children) {
        elements.push(`<li class="bookmark-folder"><span class="bookmark-folder-text" data-id="${node.id}">📁${node.title}</span><ul ${Object.hasOwn(openBookmarks, node.id) ? "" : "hidden"}>`);
        for (let i = 0; i < node.children.length; i++) {
            createBookmarksHelper(node.children[i], openBookmarks, elements);
        }
        elements.push(`</ul></li>`)
    }
    else {
        elements.push(`<li><a href=${node.url}>${node.title}</a></li>`);
    }
}
//#endregion

//#region widgetgrid
const createWidgetGrid = () => {
    const rows = getLocalStorage("rows", DEFAULT_ROWS);
    const columns = getLocalStorage("columns", DEFAULT_COLS);
    const activeWidgets = getLocalStorage("active-widgets", {});

    const grid = document.getElementById("widget-grid");
    grid.style.gridTemplateRows = "1fr ".repeat(rows);
    grid.style.gridTemplateColumns = "1fr ".repeat(columns);

    const children = [];
    for (let i = 0; i < rows * columns; i ++) {
        const row = Math.floor(i / columns) + 1;
        const col = (i % columns) + 1;
        const activeWidget = activeWidgets[JSON.stringify([row, col])];
        if (activeWidget) {
            const widget = createWidget(activeWidget.type, activeWidget.extra);
            if (widget) {
                widget.style.gridRow = row;
                widget.style.gridColumn = col;
                children.push(widget);
            }
        }
    }
    grid.replaceChildren(...children);
}

const createWidget = (type, extra) => {
    let element = undefined;
    if (type === WIDGET_TYPE_NONE) {}
    else if (type === WIDGET_TYPE_BOOKMARKS) {
        element = document.createElement("div");
        addClass(element, "grid-item");
        chrome.bookmarks.getTree((root) => {
            const bookmarks = createBookmarks(root);
            element.appendChild(bookmarks);
        })
    }
    else if (type === WIDGET_TYPE_YOUTUBE_LIVESTREAM) {
        element = document.createElement("iframe");
        element.setAttribute("allowfullscreen", 1);
        addClass(element, "grid-item");
        getFirstLivestream(extra).then((url) => {
            if (url) element.setAttribute("src", url);
        })
    }
    else if (type === WIDGET_TYPE_YOUTUBE) {
        element = document.createElement("iframe");
        element.setAttribute("allowfullscreen", 1);
        addClass(element, "grid-item");
        element.setAttribute("src", `https://www.youtube.com/embed${extra.type === "playlist" ? "?listType=playlist&list=" : "/"}${extra.id}`);
    }
    return element;
}
//#endregion

// WIP
const loadEditGrid = () => {
    const rows = localStorage.getItem("rows") ?? DEFAULT_ROWS;
    const columns = localStorage.getItem("columns") ?? DEFAULT_COLS;
    const grid = document.getElementById("widget-grid");
    const activeWidgets = JSON.parse(localStorage.getItem("active-widgets")) ?? {};

    const children = [];
    for (let i = 0; i < rows * columns; i ++) {
        const row = Math.floor(i / columns) + 1;
        const col = (i % columns) + 1;
        const div = document.createElement("div");
        div.classList.add("grid-item");
        const activeWidget = activeWidgets[JSON.stringify([row, col])];
        if (!activeWidget) {
            div.addEventListener("drop", (e) => {
                e.preventDefault();
                let widget = undefined;
                const active = JSON.parse(localStorage.getItem("active-widgets")) ?? {};
                if (e.dataTransfer.types.includes("widget")) {
                    const inactive = JSON.parse(localStorage.getItem("inactive-widgets")) ?? {};
                    widget = JSON.parse(e.dataTransfer.getData("widget"));
                    delete inactive[widget.id];
                    localStorage.setItem("inactive-widgets", JSON.stringify(inactive));
                }
                if (e.dataTransfer.types.includes("active-widget")) {
                    widget = JSON.parse(e.dataTransfer.getData("active-widget"));
                    delete active[JSON.stringify([widget.row, widget.col])];
                }
                active[JSON.stringify([row, col])] = new ActiveWidget(widget, row, col);
                localStorage.setItem("active-widgets", JSON.stringify(active));
                loadToolbox();
                loadEditGrid();
            })
            div.addEventListener("dragover", (e) => {
                if (e.dataTransfer.types.includes("widget") || e.dataTransfer.types.includes("active-widget")) {
                    e.preventDefault();
                }
            })
        }
        else {
            div.classList.add("occupied-slot");
            div.textContent = activeWidget.name;

            div.addEventListener("click", () => {
                popupEditWidget(activeWidget, (result) => {
                    const widgets = JSON.parse(localStorage.getItem("active-widgets")) ?? {};
                    const index = JSON.stringify([result.widget.row, result.widget.col]);
                    if (!result.deleted) {
                        widgets[index] = result.widget;
                    }
                    else {
                        delete widgets[index];
                    }
                    localStorage.setItem("active-widgets", JSON.stringify(widgets));
                    loadEditGrid();
                });
            })

            div.setAttribute("draggable", true);
            div.addEventListener("dragstart", (e) => {
                e.dataTransfer.setData("active-widget", JSON.stringify(activeWidget));
            });
        }
        children.push(div);
    }
    grid.replaceChildren(...children);
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
    modal.hidden = true;
    document.getElementById("options").addEventListener("click", () => {
        modal.hidden = false;
    })
    document.getElementById("options-modal-close").addEventListener("click", () => {
        modal.hidden = true;
    })

    // todo: parallel promises?
    initializeElement("header-links-list", "");
    initializeElement("rows", DEFAULT_ROWS);
    initializeElement("columns", DEFAULT_COLS);
    // initializeElement("stream-list", "");
}

const loadHeader = () => {
    const headerLinksList = localStorage.getItem("header-links-list");
    if (headerLinksList) {
        const urls = headerLinksList.split(/\r?\n|\r|\n/g);
        const bar = document.getElementById("header-bar");
        urls.map((url) => {
            const link = document.createElement("a");
            link.setAttribute("href", url);
            link.textContent = url;
            bar.appendChild(link);
        })
    }
}

class Widget {
    constructor(id = "", name = "New Widget", type = "", extra = null) {
        this.id = id;
        this.name = name;
        this.type = type;
        this.extra = extra;
    }
}

class ActiveWidget extends Widget {
    constructor(widget, row, col) {
        super(widget.id, widget.name, widget.type, widget.extra);
        this.row = row;
        this.col = col;
        // todo: size
    }
}

const loadExtraOptions = (type, extra) => {
    const extraOptions = document.getElementById("extra-options");
    const newOptions = [];
    if (type === WIDGET_TYPE_NONE) {}
    else if (type === WIDGET_TYPE_BOOKMARKS) {}
    else if (type === WIDGET_TYPE_YOUTUBE_LIVESTREAM) {
        const label = document.createElement("label");
        label.setAttribute("for", "stream-list");
        label.textContent = "Channels:";
        newOptions.push(label);
        newOptions.push(document.createElement("br"));
        const textArea = document.createElement("textarea");
        textArea.setAttribute("id", "stream-list");
        textArea.setAttribute("rows", 10);
        textArea.setAttribute("cols", 60);
        if (extra) textArea.value = extra;
        newOptions.push(textArea);
    }
    else if (type === WIDGET_TYPE_YOUTUBE) {
        const typeLabel = document.createElement("label");
        typeLabel.setAttribute("for", "youtube-type");
        typeLabel.textContent = "Video Type:";
        newOptions.push(typeLabel);
        newOptions.push(document.createElement("br"));
        const select= document.createElement("select");
        select.setAttribute("id", "youtube-type");
        const video = document.createElement("option");
        video.setAttribute("value", "video");
        video.textContent = "Video";
        select.appendChild(video);
        const playlist = document.createElement("option");
        playlist.setAttribute("value", "playlist");
        playlist.textContent = "Playlist";
        select.append(playlist);
        if (extra) select.value = extra.type;
        newOptions.push(select);
        newOptions.push(document.createElement("br"));
        const idLabel = document.createElement("label");
        idLabel.setAttribute("for", "youtube-id");
        idLabel.textContent = "ID:";
        newOptions.push(idLabel);
        newOptions.push(document.createElement("br"));
        const idInput = document.createElement("input");
        idInput.setAttribute("id", "youtube-id");
        if (extra) idInput.value = extra.id;
        newOptions.push(idInput);
    }
    extraOptions.replaceChildren(...newOptions);
}

const getExtraOptions = (type) => {
    if (type === WIDGET_TYPE_NONE) {}
    else if (type === WIDGET_TYPE_BOOKMARKS) {}
    else if (type === WIDGET_TYPE_YOUTUBE_LIVESTREAM) {
        const list = document.getElementById("stream-list");
        return list.value;
    }
    else if (type === WIDGET_TYPE_YOUTUBE) {
        const type = document.getElementById("youtube-type");
        const id = document.getElementById("youtube-id");
        return {"type": type.value, "id": id.value};
    }
    return;
}

const popupEditWidget = (widget, callback) => {
    const modal = document.getElementById("edit-widget-modal");
    modal.hidden = false;

    const nameInput = document.getElementById("widget-name");
    const typeInput = document.getElementById("widget-type");
    nameInput.value = widget.name;
    typeInput.value = widget.type;
    typeInput.onchange = (e) => {
        loadExtraOptions(e.currentTarget.value, null);
    }
    loadExtraOptions(widget.type, widget.extra);

    const saveWidget = document.getElementById("save-widget");
    saveWidget.onclick = () => {
        const extra = getExtraOptions(typeInput.value);
        widget.name = nameInput.value;
        widget.type = typeInput.value;
        widget.extra = extra;
        modal.hidden = true;
        callback({"widget": widget, "deleted": false});
    }

    const deleteWidget = document.getElementById("delete-widget");
    if (widget.id) {
        deleteWidget.hidden = false;
        deleteWidget.onclick = () => {
            if (confirm("Are you sure?")) {
                modal.hidden = true;
                callback({"widget": widget, "deleted": true});
            }
        }
    }
    else {
        deleteWidget.hidden = true;
    }
}

const loadToolbox = () => {
    const toolbox = document.getElementById("widget-toolbox");

    const widgets = JSON.parse(localStorage.getItem("inactive-widgets")) ?? {};

    // todo: handle out of bounds
    const addWidget = createWidgetElement("Create Widget", new Widget());
    const newChildren = [addWidget];
    for (const id of Object.keys(widgets)) {
        const widget = createWidgetElement(widgets[id].name, widgets[id]);

        widget.setAttribute("draggable", true);
        widget.addEventListener("dragstart", (e) => {
            e.dataTransfer.setData("widget", JSON.stringify(widgets[id]));
        });
        newChildren.push(widget);
    }

    toolbox.addEventListener("drop", (e) => {
        e.preventDefault();
        const widget = JSON.parse(e.dataTransfer.getData("active-widget"));

        const active = JSON.parse(localStorage.getItem("active-widgets")) ?? {};
        const inactive = JSON.parse(localStorage.getItem("inactive-widgets")) ?? {};
        inactive[widget.id] = new Widget(widget.id, widget.name, widget.type, widget.extra);
        delete active[JSON.stringify([widget.row, widget.col])];
        localStorage.setItem("inactive-widgets", JSON.stringify(inactive));
        localStorage.setItem("active-widgets", JSON.stringify(active));
        loadToolbox();
        loadEditGrid();
    })
    toolbox.addEventListener("dragover", (e) => {
        if (e.dataTransfer.types.includes("active-widget")) {
            e.preventDefault();
        }
    })

    toolbox.replaceChildren(...newChildren);
}

const createWidgetElement = (text, widget) => {
    const element = document.createElement("div");
    element.textContent = text;
    element.classList.add("widget");
    element.addEventListener("click", () => {
        popupEditWidget(widget, (result) => {
            const widgets = JSON.parse(localStorage.getItem("inactive-widgets")) ?? {};
            if (!result.deleted) {
                const oldWidget = widgets[result.widget.id];
                if (oldWidget) {
                    widgets[result.widget.id] = result.widget;
                }
                else {
                    const id = crypto.randomUUID();
                    result.widget.id = id;
                    widgets[id] = result.widget;
                }
            }
            else {
                delete widgets[result.widget.id];
            }
            localStorage.setItem("inactive-widgets", JSON.stringify(widgets));
            loadToolbox();
        });
    })
    return element;
}

const loadSidebar = () => {
    const sideButton = document.getElementById("side-button");
    sideButton.addEventListener("click", () => {
        const toolbox = document.getElementById("widget-toolbox");
        toolbox.hidden = !toolbox.hidden;
        if (!toolbox.hidden) {
            loadEditGrid();
        }
        else {
            createWidgetGrid();
        }
    })

    const toolbox = document.getElementById("widget-toolbox");
    toolbox.hidden = true;
    loadToolbox();

    const modal = document.getElementById("edit-widget-modal-close");
    modal.addEventListener("click", () => {
        const modal = document.getElementById("edit-widget-modal");
        modal.hidden = true;
    })
}

window.addEventListener("DOMContentLoaded", () => {
    loadSidebar();
    loadHeader();
    createWidgetGrid();
    loadOptions();

    const modal = document.getElementById("edit-widget-modal");
    modal.hidden = true;
})
