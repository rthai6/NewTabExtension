"use strict";

const DEFAULT_ROWS = 2;
const DEFAULT_COLS = 3;

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
    // use object because hashset isn't stringifiable
    const openBookmarks = JSON.parse(localStorage.getItem("open-bookmarks")) ?? {};

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
                const active = e.currentTarget.parentElement.querySelector(".hidden").classList.contains("active");
                const newOpenBookmarks = JSON.parse(localStorage.getItem("open-bookmarks")) ?? {};
                if (active) {
                    newOpenBookmarks[node.id] = null;
                }
                else {
                    delete newOpenBookmarks[node.id];
                }
                localStorage.setItem("open-bookmarks", JSON.stringify(newOpenBookmarks))
            });
            span.appendChild(text);
            rootItem.appendChild(span);

            const list = document.createElement("ul");
            list.classList.add("bookmark-list");
            list.classList.add("hidden");
            if (Object.hasOwn(openBookmarks, node.id)) list.classList.add("active");
            node.children.map((n) => {
                queue.push([list, n]);
            })
            rootItem.appendChild(list);
        }
        else {
            const link = document.createElement("a");
            link.setAttribute("href", node.url);
            const text = document.createTextNode(node.title);
            link.appendChild(text);
            rootItem.appendChild(link);
        }
        parent.appendChild(rootItem);
    }
}

const loadGrid = () => {
    const rows = localStorage.getItem("rows") ?? DEFAULT_ROWS;
    const columns = localStorage.getItem("columns") ?? DEFAULT_COLS;
    const grid = document.getElementById("widget-grid");
    grid.style.gridTemplateRows = "1fr ".repeat(rows);
    grid.style.gridTemplateColumns = "1fr ".repeat(columns);

    // chrome.bookmarks.getTree((results) => {
    //     loadBookmarks(results);
    // })

    // findFirstLivestream().then((url) => {
    //     if (url) {
    //         const stream = document.getElementById("stream");
    //         stream.setAttribute("src", url)
    //     }
    //     else {
    //         // todo: handle no livestream
    //     }
    // });
}

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
            const text = document.createTextNode(activeWidget.name);
            div.appendChild(text);
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
    document.getElementById("options").addEventListener("click", () => {
        modal.classList.add("active");
    })
    document.getElementById("options-modal-close").addEventListener("click", () => {
        modal.classList.remove("active");
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
            const text = document.createTextNode(url);
            link.appendChild(text);
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
    if (type === "") {}
    else if (type === "bookmarks") {}
    else if (type === "streams") {
        const label = document.createElement("label");
        label.setAttribute("for", "stream-list");
        const labelText = document.createTextNode("Stream List:");
        label.appendChild(labelText);
        newOptions.push(label);
        const br = document.createElement("br");
        newOptions.push(br);
        const textArea = document.createElement("textarea");
        textArea.setAttribute("id", "stream-list");
        textArea.setAttribute("rows", 10);
        textArea.setAttribute("cols", 60);
        if (extra) textArea.value = extra;
        newOptions.push(textArea);
    }
    else if (type === "youtube") {
    }
    extraOptions.replaceChildren(...newOptions);
}

const getExtraOptions = (type) => {
    if (type === "") {}
    else if (type === "bookmarks") {}
    else if (type === "streams") {
        const textArea = document.getElementById("stream-list");
        return textArea.value;
    }
    else if (type === "youtube") {

    }
    return;
}

const activateEditWidget = (widget) => {
    const modal = document.getElementById("edit-widget-modal");
    const currentWidget = widget;
    const widgetName = document.getElementById("widget-name");
    widgetName.value = currentWidget.name;
    const widgetType = document.getElementById("widget-type");
    widgetType.value = currentWidget.type;
    widgetType.addEventListener("change", (e) => {
        loadExtraOptions(e.currentTarget.value, null);
    })

    loadExtraOptions(widget.type, widget.extra);

    const saveWidget = document.getElementById("save-widget");
    saveWidget.onclick = () => {
        // todo: validate
        const extra = getExtraOptions(widgetType.value);
        const widgets = JSON.parse(localStorage.getItem("inactive-widgets")) ?? {};
        const oldWidget = widgets[widget.id];
        if (oldWidget) {
            oldWidget.name = widgetName.value;
            oldWidget.type = widgetType.value;
            oldWidget.extra = extra;
        }
        else {
            const id = crypto.randomUUID();
            widgets[id] = new Widget(id, widgetName.value, widgetType.value, extra);
        }
        localStorage.setItem("inactive-widgets", JSON.stringify(widgets));
        modal.classList.remove("active");

        loadToolbox();
    }

    const deleteWidget = document.getElementById("delete-widget");
    if (widget.id) {
        deleteWidget.classList.remove("hidden");
        deleteWidget.onclick = () => {
            if (confirm("Are you sure?")) {
                const widgets = JSON.parse(localStorage.getItem("inactive-widgets")) ?? {};
                delete widgets[widget.id];
                localStorage.setItem("inactive-widgets", JSON.stringify(widgets));
                modal.classList.remove("active");

                loadToolbox();
            }
        }
    }
    else {
        deleteWidget.classList.add("hidden");
    }
    modal.classList.add("active")
}

const loadToolbox = () => {
    const toolbox = document.getElementById("widget-toolbox");

    const widgets = JSON.parse(localStorage.getItem("inactive-widgets")) ?? {};

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

    toolbox.replaceChildren(...newChildren);
}

const createWidgetElement = (text, widget) => {
    const element = document.createElement("div");
    const addText = document.createTextNode(text);
    element.appendChild(addText);
    element.classList.add("widget");
    element.addEventListener("click", () => {
        activateEditWidget(widget);
    })
    return element;
}

const loadSidebar = () => {
    const sideButton = document.getElementById("side-button");
    sideButton.addEventListener("click", () => {
        const toolbox = document.getElementById("widget-toolbox");
        toolbox.classList.toggle("active")
        if (toolbox.classList.contains("active")) {
            loadEditGrid();
        }
        else {
            // todo: regular grid
        }
    })

    loadToolbox();

    document.getElementById("edit-widget-modal-close").addEventListener("click", () => {
        const modal = document.getElementById("edit-widget-modal");
        modal.classList.remove("active");
    })
}

window.addEventListener("DOMContentLoaded", async () => {
    loadSidebar();
    loadHeader();
    loadGrid();
    loadOptions();
})