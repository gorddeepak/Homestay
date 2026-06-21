const express = require('express');
const app = express()
const mongoose = require('mongoose');
const MONGO_URL = "mongodb://127.0.0.1:27017/airbnb";
const Listing = require("./models/listing.js");
const initData = require("./data.js");

async function main(){
    await mongoose.connect(MONGO_URL)
}

main().then(()=>{
    console.log("connected to db");
})
.catch((err)=>{
    console.log(err)
});

const initDb = async() => {
    await Listing.deleteMany({});
    initData.data =  initData.data.map((obj)=>({...obj, owner: "6a33f4524d15b1f9c5dc6dc6"}));
    await Listing.insertMany(initData.data);
    console.log("Database initialized sucessfully");
};

initDb();

