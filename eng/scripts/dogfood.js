import { npmForEach, run } from "./helpers.js";
run("rush", ["update"]);
run("rush", ["build"]);
npmForEach("dogfood");
