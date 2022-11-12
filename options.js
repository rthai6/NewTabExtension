"use strict";

window.onload = () => {
    var streamListElement = document.getElementById("streamList");

    const streamList = localStorage.getItem("streamList");
    streamListElement.value = streamList ?? "";

    streamListElement.addEventListener("input", (e) => {
        localStorage.setItem("streamList", e.currentTarget.value);
    })
}