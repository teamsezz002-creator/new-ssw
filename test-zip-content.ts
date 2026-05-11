import AdmZip from "adm-zip";
import fetch from "node-fetch";
const url = "https://firebasestorage.googleapis.com/v0/b/sezsimulationworld.firebasestorage.app/o/simulations%2Fsim_new_1777967156873.zip?alt=media&token=4d7345bf-b4ea-45f1-8e8c-8528dbfad6d5";
fetch(url).then(r => r.arrayBuffer()).then(b => {
   const z = new AdmZip(Buffer.from(b));
   z.getEntries().forEach(e => console.log(e.entryName));
});
