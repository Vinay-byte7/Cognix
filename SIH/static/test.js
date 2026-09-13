console.log("hello from js!");
const start = Date.now();
console.log("time started! : ", start);

// const imageData = async () => {
//     let response = await fetch("/ImageData");
//     let data = await response.json();
//     console.log(data);
//     document.getElementById("myImage").src = data.url;
// };

// imageData();

let weight = 300;



const neuData = async () => {
    console.log("entered inside neuData");
    let response = await fetch("/NutrientsData/banana-poovam");
    let data = await response.json();
    console.log(data);
    let name = data.name;
    let calories = data.calories;
    let fat = data.fat;
    let sugar = data.sugar;
    let carbohydrates = data.carbohydrates;
    let protein = data.protein;
    console.log("name : ", name);
    console.log("calories : ", calories);
    console.log("fat : ", fat);
    console.log("sugar : ", sugar);
    console.log("carbohydrates : ", carbohydrates);
    console.log("protein : ", protein);
};

let just_occupied = Array(0);
let occupied = Array(0);
const crateData = async () => {
    console.log("enter crate data...");
    let response = await fetch("/sendCrate")
    let data = await response.json();
    // console.log(data)
    just_occupied = data.occupied_boxes;
    console.log(just_occupied);
}

// neuData();

if (!localStorage.getItem("start")) {
    localStorage.setItem("start", Date.now());
}
const s = parseInt(localStorage.getItem("start"));
const current = Date.now();
const finalTime = (current - s)/86400000;

fetch('/send_time', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({ Data: finalTime, w: weight })
});