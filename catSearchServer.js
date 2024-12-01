"use strict";

const path = require("path");
const bodyParser = require("body-parser");
const express = require("express");
const app = express();
const {MongoClient, ServerApiVersion} = require('mongodb');
const catApiKey = process.env.CAT_API_KEY;
const catApiUrl = "https://api.thecatapi.com/v1";

require("dotenv").config() 
const database = process.env.MONGO_DB_NAME;
const collection = process.env.MONGO_COLLECTION;
const uri = process.env.MONGO_CONNECTION_STRING;
const client = new MongoClient(uri, {serverApi:ServerApiVersion.v1});

/***** Endpoint Definitions *****/
app.set("view engine", "ejs");
app.set("views", path.resolve(__dirname, "templates"));
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({extended:false}));

// home
app.get("/", (req, res) => {
  res.render("index");
});

// search
app.get("/searchCats", async (req, res) => {
  const breedsResponse = await fetch(`${catApiUrl}/breeds`, {
    headers: {"x-api-key":catApiKey},
  });
  const breeds = await breedsResponse.json();

  const categoriesResponse = await fetch(`${catApiUrl}/categories`, {
    headers: {"x-api-key":catApiKey},
  });
  const categories = await categoriesResponse.json();

  res.render("searchCats", {breeds, categories});
});

app.post("/processSearchCats", async (req, res) => {
  const {random_cats, breed_ids, category_ids} = req.body;

  let url = `${catApiUrl}/images/search?limit=10`;

  if (random_cats === "true") {
    url += `&order=RANDOM`;
  }

  if (breed_ids) {
    url += `&breed_ids=${breed_ids}`;
  }

  if (category_ids) {
    url += `&category_ids=${category_ids}`;
  }

  try {
    const response = await fetch(url, {
      headers: {"x-api-key":catApiKey},
    });
    const catImages = await response.json();

    await client.connect();
    const db = client.db(database);
    const searches = db.collection(collection);
    await searches.insertOne({
      breed_ids,
      category_ids,
      random_cats,
      timestamp: new Date(),
    });

    res.render("processSearchCats", {catImages});

  } catch (error) {
    console.error(error);
    res.send("Error fetching cat images.");
  }
});

// history
app.get("/searchHistory", async (req, res) => {
  try {
    await client.connect();
    const db = client.db(database);
    const searches = await db.collection(collection)
      .find()
      .sort({ timestamp: -1 })
      .limit(10)
      .toArray();

    const breedsResponse = await fetch(`${catApiUrl}/breeds`, {
      headers: { "x-api-key": catApiKey },
    });
    const breeds = await breedsResponse.json();

    const categoriesResponse = await fetch(`${catApiUrl}/categories`, {
      headers: { "x-api-key": catApiKey },
    });
    const categories = await categoriesResponse.json();

    const breedLookup = Object.fromEntries(breeds.map(b => [b.id, b.name]));
    const categoryLookup = Object.fromEntries(categories.map(c => [c.id, c.name]));

    const history = searches.map(search => ({
      ...search,
      breedName: search.breed_ids ? breedLookup[search.breed_ids] : null,
      categoryName: search.category_ids ? categoryLookup[search.category_ids] : null,
    }));

    res.render("searchHistory", {history});
  } catch (error) {
    console.error(error);
    res.send("Error fetching search history.");
  }
});

/***** Command Line Interface and Starting Server *****/
if (process.argv.length != 3) {
  process.stdout.write("Usage catSearchServer.js portNumber");
  process.exit(1);
}

const portNumber = process.argv[2];
app.listen(portNumber);
console.log(`Web server started and running at http://localhost:${portNumber}`);

const prompt = "Type stop to shutdown the server: "
process.stdout.write(prompt);
process.stdin.setEncoding("utf8");
process.stdin.on("readable", function () {
  const input = process.stdin.read();
  if (input !== null) {
    const command = input.trim();
    if (command === "stop") {
      console.log("Shutting down the server");
      process.exit(0);
    } else {
      console.log(`Invalid command: ${command}`);
    }
    process.stdout.write(prompt);
    process.stdin.resume();
  }
});