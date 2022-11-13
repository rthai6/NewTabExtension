"use strict";

window.addEventListener("DOMContentLoaded", async () => {
    var streamListElement = document.getElementById("streamList");

    const streamList = localStorage.getItem("streamList");
    streamListElement.value = streamList ?? "";

    streamListElement.addEventListener("input", (e) => {
        localStorage.setItem("streamList", e.currentTarget.value);
    })
})