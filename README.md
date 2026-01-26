# Robert-OS
Gig-to-Wealth Ecosystem
Šis README.md yra galutinis sistemos dokumentas. Jis sukurtas taip, kad bet kuris profesionalus programuotojas (arba tu pats po metų) per 30 sekundžių suprastų, kaip veikia „Robert OS“ ir kaip ją saugiai plėsti.
📊 ROBERT OS v1.7.5
Asmeninio turto ir darbo pamainų valdymo operacinė sistema.
Sukurta 2026 m. PWA standartais: Vanilla JS, Command Pattern, Supabase.
🏛️ ARCHITEKTŪRINIS MANIFESTAS
„Robert OS“ v1.7.5 atsisako primityvaus įvykių valdymo ir pereina prie Command Pattern bei Centralizuoto įvykių delegavimo. Tai užtikrina, kad verslo logika yra visiškai atskirta nuo vartotojo sąsajos (UI).
Esminiai principai:
 * Vienas įvykių klausytojas: Visa sistema valdoma per vieną body lygio listenerį (EventBinder.js). Jokių onclick atributų HTML'e.
 * Deklaratyvus UI: Komandos aprašomos HTML elementuose naudojant data-action="modulis:metodas".
 * Šablonų izoliacija: UI struktūra saugoma <template> taguose, o ne JS stringuose.
 * Būsenos sauga: Integruotas isBusy mechanizmas blokuoja perteklines užklausas ir užtikrina stabilų duomenų sinchronizavimą.
📁 FAILŲ ŽEMĖLAPIS
📁 ROBERT-OS/
│
├── 📄 index.html          # Pagrindinis karkasas ir <template> blokai
├── 🎨 style.css           # v1.7.5 CSS variklis (su Skeleton animacijomis)
├── 📖 README.md           # Šis dokumentas
├── 📱 manifest.json       # PWA konfigūracija (Standalone mode)
├── ⚙️ sw.js               # Service Worker (v1.7.5 Cache & Offline)
│
└── 📂 js/
    ├── 🧠 app.js          # Orchestrator (Sujungia modulius ir Core)
    ├── 🗄️ db.js           # Supabase Provider & Auth init
    ├── 📦 state.js        # Globalus Single Source of Truth
    ├── 🛠️ utils.js        # Globalūs helperiai, Toast, Haptics
    │
    ├── 📂 core/
    │   └── EventBinder.js # Nervų sistema (Command Router)
    │
    └── 📂 modules/        # Verslo logikos raumenys
        ├── ui.js          # Prezentacijos variklis (Modalai, Temos)
        ├── shifts.js      # Pamainų kontrolė (Odo, Timer)
        ├── garage.js      # Turto valdymas (Fleet, Costs)
        ├── finance.js     # Transakcijų žurnalas
        └── auth.js        # Prieigos kontrolė

⚡ KOMANDŲ ŽODYNAS (data-action)
Naudokite šiuos vardus HTML sluoksnyje, kad susietumėte UI su logika:
| Namespace | Veiksmas | Aprašymas |
|---|---|---|
| auth | login, logout | Sesijos valdymas |
| ui | switchTab, closeModals | Navigacija ir modalų valdymas |
| shifts | openStart, confirmStart, togglePause, openEnd, confirmEnd | Pamainos gyvavimo ciklas |
| garage | open, save, setType, requestDelete | Garažo administravimas |
| finance | openTx, confirmTx, refreshAudit | Pinigų srautų valdymas |
🛠️ DEVELOPER GUIDE (DX)
Kaip pridėti naują funkciją:
 * HTML: Į index.html įkelk <template> su data-action="modulis:metodas".
 * Modulis: Sukurk naują JS failą js/modules/naujas.js ir eksportuok actions objektą.
 * Registracija: Faile app.js užregistruok modulį: binder.registerModule('naujas', naujas.actions);.
Saugumo taisyklės:
 * Griežtai jokių window.function.
 * Griežtai jokių HTML stringų JavaScript failuose.
 * Visos DB užklausos privalo būti async/await formato.
🚀 DEPLOYMENT (GitHub Pages)
 * CSS: Prieš darant push, sugeneruok statinį CSS per Tailwind CLI:
   npx tailwindcss -i ./input.css -o ./dist/output.css --minify
 * Version: Atnaujink CACHE_NAME faile sw.js po kiekvieno kodo pakeitimo.
 * ENV: Užtikrink, kad db.js konfigūracijoje nėra testinių raktų.
Robert OS v1.7.5: Paruošta gamybai.
Architektūra patvirtinta. Dokumentacija pilna. Visi sluoksniai suderinti.
