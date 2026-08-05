"""Generate the multi-page Miami Jambo brand site into the GitHub Pages repo.

Reads the canonical song sheets from the KPlop project and emits real, separately
addressable pages (home / music / one page per release / artists / about / contact)
so the site reads as a developed website rather than a single landing page.
"""
import json
import os
import re

SONGS = r"C:\Users\lmfd1\KpopAnime\KPlop\songs"
AUTO = r"C:\Users\lmfd1\KpopAnime\KPlop\automation"
OUT = r"C:\Users\lmfd1\lmfd104.github.io\miamijambo"

YT_CHANNEL = "https://www.youtube.com/channel/UCdH4TainV8szXyoOlV-kQpQ"
TIKTOK = "https://www.tiktok.com/@jamesderuyter"
EMAIL = "mjambogames@gmail.com"

with open(os.path.join(AUTO, "uploaded_ids.json"), encoding="utf-8") as f:
    FULL_IDS = json.load(f)
with open(os.path.join(AUTO, "shorts_ids.json"), encoding="utf-8") as f:
    SHORT_IDS = json.load(f)

GENRE = {
    "01-delulu": "Hyperpop",
    "02-bot-not-you": "Synth-R&B",
    "03-clean-girl-morning": "Bubblegum pop",
    "04-infinite-scroll": "Trap-R&B",
    "05-work-from-home": "Disco funk",
    "06-to-the-moon": "Festival EDM",
    "07-its-you": "R&B pop",
    "08-garlic-noodles": "OST ballad",
    "09-not-famous-enough": "Hyperpop",
    "10-pants-too-tight": "Funk pop",
}


def parse_song(path):
    text = open(path, encoding="utf-8").read()
    slug = os.path.splitext(os.path.basename(path))[0]

    m = re.search(r"^#\s*(\d+)\s*·\s*(.+?)\s*\((.+?)\)\s*$", text, re.M)
    num, title_ko, title_en = m.group(1), m.group(2), m.group(3)

    concept = re.search(r"\*\*Concept:\*\*\s*(.+?)\n", text).group(1).strip()
    persona_raw = re.search(r"\*\*Artist persona:\*\*\s*(.+?)\n", text).group(1).strip()
    # "*MIRAGE* (미라지) — 5-member rookie girl group"
    pm = re.match(r"\*(.+?)\*\s*\((.+?)\)\s*—\s*(.+)", persona_raw)
    act_en, act_ko, act_desc = pm.group(1), pm.group(2), pm.group(3)

    style = re.search(r"Style prompt\s*\n```\s*\n(.+?)\n```", text, re.S).group(1).strip()
    bpm = re.search(r"(\d+)\s*BPM", style)
    bpm = bpm.group(1) if bpm else ""
    # instrumentation = the descriptive middle of the style prompt
    parts = [p.strip() for p in style.split(",")]
    sound_bits = [p for p in parts if "BPM" not in p][1:]

    chorus = []
    lm = re.search(r"\[Chorus\]\n(.+?)\n\s*\n", text, re.S)
    if lm:
        chorus = [ln.strip() for ln in lm.group(1).splitlines() if ln.strip()][:6]

    return dict(
        slug=slug, num=num, title_en=title_en, title_ko=title_ko,
        concept=concept, act_en=act_en, act_ko=act_ko, act_desc=act_desc,
        style=style, bpm=bpm, sound=sound_bits, chorus=chorus,
        genre=GENRE[slug], video=FULL_IDS[slug], short=SHORT_IDS[slug],
        cover="covers/%s.png" % slug,
    )


def esc(s):
    """HTML-escape, then honour the source sheets' markdown emphasis (*word*)."""
    s = s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    return re.sub(r"\*([^*\n]+)\*", r"<em>\1</em>", s)


STYLE = """
  :root{
    --pink:#ff2e93; --pink-lo:#ff6bb0; --magenta:#e01a86; --plum:#2a0730;
    --plum-2:#3d0f47; --ink:#1a0620; --cream:#fff4fb; --muted:#e9b9d6;
  }
  *{box-sizing:border-box}
  html{scroll-behavior:smooth}
  body{margin:0; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
    color:var(--cream); background:var(--ink); line-height:1.6; -webkit-font-smoothing:antialiased}
  a{color:var(--pink-lo); text-decoration:none}
  a:hover{text-decoration:underline}
  .wrap{max-width:1080px; margin:0 auto; padding:0 20px}
  .narrow{max-width:800px}

  header{position:sticky; top:0; z-index:20; backdrop-filter:blur(10px);
    background:rgba(26,6,32,.86); border-bottom:1px solid rgba(255,46,147,.25)}
  .bar{display:flex; align-items:center; gap:14px; padding:12px 20px; max-width:1080px; margin:0 auto}
  .bar img{width:40px; height:40px; border-radius:11px; display:block}
  .brand{font-weight:800; font-size:1.15rem; letter-spacing:.2px; color:var(--cream)}
  .brand:hover{text-decoration:none}
  .brand span{color:var(--pink)}
  nav{margin-left:auto; display:flex; gap:20px; font-weight:600; font-size:.95rem; flex-wrap:wrap}
  nav a{color:var(--muted)}
  nav a:hover, nav a.on{color:#fff; text-decoration:none}
  nav a.on{border-bottom:2px solid var(--pink)}
  @media(max-width:700px){.bar{flex-wrap:wrap} nav{margin-left:0; width:100%; gap:14px; font-size:.88rem}}

  .hero{position:relative; text-align:center; padding:74px 20px 66px;
    background:radial-gradient(120% 130% at 15% 0%, #ff6bb0 0%, #e01a86 42%, #a3116a 100%); overflow:hidden}
  .hero:before{content:""; position:absolute; inset:0;
    background:radial-gradient(60% 60% at 85% 110%, rgba(255,255,255,.14), transparent 60%)}
  .hero-inner{position:relative; z-index:1; max-width:760px; margin:0 auto}
  .hero img.logo{width:104px; height:104px; border-radius:26px; box-shadow:0 12px 40px rgba(0,0,0,.35); margin-bottom:22px}
  .kicker{display:inline-block; font-weight:800; letter-spacing:.28em; text-transform:uppercase;
    font-size:.72rem; color:#fff; background:rgba(0,0,0,.22); padding:7px 14px; border-radius:999px; margin-bottom:18px}
  .hero h1{font-size:clamp(2.2rem,6.4vw,4rem); line-height:1.04; margin:.1em 0 .28em; font-weight:900; color:#fff}
  .hero p.tag{font-size:clamp(1.02rem,2.4vw,1.3rem); color:#fff; opacity:.96; margin:0 auto 30px; max-width:620px}
  .cta{display:flex; gap:14px; justify-content:center; flex-wrap:wrap}
  .btn{display:inline-block; font-weight:800; padding:14px 26px; border-radius:999px; font-size:1rem}
  .btn-yt{background:#fff; color:#c0136f}
  .btn-tt{background:var(--plum); color:#fff}
  .btn-ghost{background:transparent; color:#fff; border:2px solid rgba(255,255,255,.6)}
  .btn:hover{text-decoration:none}

  .pagehead{background:linear-gradient(180deg,#2a0730,#1a0620); padding:52px 0 42px; border-bottom:1px solid rgba(255,46,147,.18)}
  .pagehead h1{font-size:clamp(1.9rem,5vw,3rem); font-weight:900; margin:.15em 0 .3em}
  .pagehead p{color:var(--muted); font-size:1.06rem; margin:0; max-width:640px}
  .crumb{font-size:.85rem; color:#a97fa0; font-weight:600; letter-spacing:.04em}
  .crumb a{color:#a97fa0}

  section{padding:56px 0}
  .section-head{text-align:center; max-width:660px; margin:0 auto 40px}
  h2{font-size:clamp(1.5rem,3.6vw,2.3rem); font-weight:900; margin:0 0 12px}
  h2 .em{color:var(--pink)}
  h3{font-size:1.2rem; margin:0 0 8px}
  .lead{color:var(--muted); font-size:1.06rem; margin:0}
  p{margin:0 0 16px}

  .pillars{display:grid; grid-template-columns:repeat(3,1fr); gap:20px}
  @media(max-width:760px){.pillars{grid-template-columns:1fr}}
  .pill{background:var(--plum); border:1px solid rgba(255,46,147,.22); border-radius:18px; padding:26px}
  .pill .ico{font-size:1.7rem; margin-bottom:10px}
  .pill h3{margin:0 0 8px; font-size:1.15rem}
  .pill p{margin:0; color:var(--muted); font-size:.98rem}

  .alt{background:linear-gradient(180deg,#1a0620,#250a2e)}
  .grid{display:grid; grid-template-columns:repeat(2,1fr); gap:22px}
  @media(max-width:760px){.grid{grid-template-columns:1fr}}
  .card{background:var(--plum); border:1px solid rgba(255,46,147,.2); border-radius:18px; overflow:hidden;
    display:flex; flex-direction:column; transition:transform .16s, box-shadow .16s}
  .card:hover{transform:translateY(-4px); box-shadow:0 16px 40px rgba(224,26,134,.28); text-decoration:none}
  .card .cov{display:block; width:100%; aspect-ratio:16/9; object-fit:cover; background:#000}
  .card .body{padding:18px 20px 20px; display:flex; flex-direction:column; flex:1}
  .card .num{font-weight:800; color:var(--pink); font-size:.8rem; letter-spacing:.1em}
  .card h3{margin:4px 0 2px; font-size:1.25rem; color:var(--cream)}
  .card .ko{color:var(--muted); font-weight:600; font-size:.95rem; margin-bottom:10px}
  .card p.desc{margin:0 0 16px; color:#f4d9ea; font-size:.95rem}
  .watch{margin-top:auto; align-self:flex-start; font-weight:800; color:#fff; background:var(--pink);
    padding:9px 18px; border-radius:999px; font-size:.9rem}

  .release-top{display:grid; grid-template-columns:minmax(0,1.35fr) minmax(0,1fr); gap:32px; align-items:start}
  @media(max-width:860px){.release-top{grid-template-columns:1fr}}
  .videobox{position:relative; width:100%; aspect-ratio:16/9; border-radius:16px; overflow:hidden;
    border:1px solid rgba(255,46,147,.25); background:#000}
  .videobox iframe{position:absolute; inset:0; width:100%; height:100%; border:0}
  .facts{background:var(--plum); border:1px solid rgba(255,46,147,.22); border-radius:16px; padding:22px 24px}
  .facts dl{margin:0; display:grid; grid-template-columns:auto 1fr; gap:8px 18px; font-size:.95rem}
  .facts dt{color:var(--pink); font-weight:800; letter-spacing:.03em}
  .facts dd{margin:0; color:var(--cream)}
  .tagx{display:inline-block; font-size:.72rem; font-weight:700; letter-spacing:.03em; padding:4px 10px;
    border-radius:999px; background:rgba(255,46,147,.16); color:#ffb3d9; margin:0 6px 6px 0}

  .prose{max-width:800px}
  .prose h2{margin-top:38px; font-size:1.45rem}
  .prose ul{color:var(--muted); padding-left:20px}
  .prose li{margin-bottom:8px}
  .lyric{background:var(--plum-2); border-left:4px solid var(--pink); border-radius:0 12px 12px 0;
    padding:18px 22px; margin:0 0 18px; white-space:pre-line; font-size:1.02rem; color:#ffe6f5}
  .qa{background:var(--plum); border:1px solid rgba(255,46,147,.2); border-radius:14px; padding:20px 22px; margin-bottom:16px}
  .qa h3{color:var(--pink); font-size:1.05rem}
  .qa p:last-child{margin-bottom:0}

  .roster{display:grid; grid-template-columns:repeat(2,1fr); gap:20px}
  @media(max-width:760px){.roster{grid-template-columns:1fr}}
  .act{background:var(--plum); border:1px solid rgba(255,46,147,.2); border-radius:16px; padding:22px 24px}
  .act .name{font-weight:900; font-size:1.2rem; color:#fff}
  .act .ko{color:var(--muted); font-weight:600; margin-bottom:10px}
  .act p{margin:0 0 12px; color:#f4d9ea; font-size:.95rem}

  .pager{display:flex; justify-content:space-between; gap:16px; flex-wrap:wrap;
    border-top:1px solid rgba(255,46,147,.2); padding-top:22px; margin-top:44px; font-weight:700}

  footer{background:#120418; border-top:1px solid rgba(255,46,147,.22); padding:44px 20px 40px; text-align:center}
  footer img{width:46px; height:46px; border-radius:13px; margin-bottom:14px}
  footer .fbrand{font-weight:800; font-size:1.05rem; margin-bottom:6px}
  footer p{color:var(--muted); margin:6px 0}
  .flinks{display:flex; gap:18px; justify-content:center; flex-wrap:wrap; margin:16px 0 10px; font-weight:600}
  .fine{color:#8f6d84; font-size:.82rem; margin-top:18px}
"""


def head(title, desc, up="", nav_on=""):
    def n(href, label, key):
        cls = ' class="on"' if key == nav_on else ""
        return '<a href="%s%s"%s>%s</a>' % (up, href, cls, label)

    return """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>%(title)s</title>
<meta name="description" content="%(desc)s">
<link rel="canonical" href="https://lmfd104.github.io/miamijambo/">
<link rel="icon" type="image/png" sizes="32x32" href="%(up)sfavicon-32.png">
<link rel="icon" type="image/png" sizes="16x16" href="%(up)sfavicon-16.png">
<link rel="apple-touch-icon" sizes="180x180" href="%(up)sapple-touch-icon.png">
<meta property="og:title" content="%(title)s">
<meta property="og:description" content="%(desc)s">
<meta property="og:image" content="https://lmfd104.github.io/miamijambo/icon-512.png">
<meta property="og:type" content="website">
<link rel="stylesheet" href="%(up)sstyle.css">
</head>
<body>

<header>
  <div class="bar">
    <img src="%(up)sicon-512.png" alt="Miami Jambo logo">
    <a class="brand" href="%(up)sindex.html">Miami <span>Jambo</span></a>
    <nav>
      %(nav)s
    </nav>
  </div>
</header>
""" % dict(
        title=esc(title), desc=esc(desc), up=up,
        nav="\n      ".join([
            n("index.html", "Home", "home"),
            n("music.html", "Music", "music"),
            n("artists.html", "The Acts", "artists"),
            n("about.html", "About", "about"),
            n("contact.html", "Contact", "contact"),
        ]),
    )


def foot(up=""):
    return """
<footer>
  <img src="%(up)sicon-512.png" alt="Miami Jambo logo">
  <div class="fbrand">Miami Jambo</div>
  <p>Original parody K-pop and short-form video. Made with a lot of synths and a little chaos.</p>
  <div class="flinks">
    <a href="%(up)sindex.html">Home</a>
    <a href="%(up)smusic.html">Music</a>
    <a href="%(up)sartists.html">The Acts</a>
    <a href="%(up)sabout.html">About</a>
    <a href="%(up)scontact.html">Contact</a>
    <a href="%(yt)s" target="_blank" rel="noopener">YouTube</a>
    <a href="%(tt)s" target="_blank" rel="noopener">TikTok</a>
    <a href="%(up)sprivacy.html">Privacy</a>
    <a href="%(up)sterms.html">Terms</a>
  </div>
  <p>Business &amp; booking: <a href="mailto:%(em)s">%(em)s</a></p>
  <p class="fine">&copy; 2026 Miami Jambo. KPlop is a parody project — every group, idol, and lyric is
  original and fictional. Not affiliated with, endorsed by, or representing any real artist, agency or label.</p>
</footer>

</body>
</html>
""" % dict(up=up, yt=YT_CHANNEL, tt=TIKTOK, em=EMAIL)


def write(rel, html):
    path = os.path.join(OUT, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(html)
    print("wrote", rel, len(html))


songs = [parse_song(os.path.join(SONGS, f))
         for f in sorted(os.listdir(SONGS)) if f.endswith(".md")]

# ---------------------------------------------------------------- style.css
write("style.css", STYLE.strip() + "\n")


# ---------------------------------------------------------------- home
def card(s, up=""):
    return """      <a class="card" href="%(up)sreleases/%(slug)s.html">
        <img class="cov" src="%(up)s%(cover)s" alt="%(title)s cover art" loading="lazy">
        <div class="body">
          <div class="num">%(num)s &middot; %(act)s</div>
          <h3>%(title)s</h3>
          <div class="ko">%(ko)s &middot; %(genre)s</div>
          <p class="desc">%(desc)s</p>
          <span class="watch">Read more &rarr;</span>
        </div>
      </a>
""" % dict(up=up, slug=s["slug"], cover=s["cover"], title=esc(s["title_en"]),
           num=s["num"], act=esc(s["act_en"]), ko=esc(s["title_ko"]),
           genre=s["genre"],
           desc=esc(s["concept"].replace("*", "")[:190].rsplit(" ", 1)[0].rstrip(" .,;:—-") + "…"))


home = head(
    "Miami Jambo — Absurd K-pop by KPlop",
    "Miami Jambo is the home of KPlop, original parody K-pop where every song turns an internet trend "
    "into a bilingual, candy-coated banger. Ten releases, ten fictional idol acts.",
    nav_on="home",
)
home += """
<section class="hero">
  <div class="hero-inner">
    <img class="logo" src="icon-512.png" alt="KPlop smiley logo">
    <div class="kicker">A Jambo Production</div>
    <h1>Absurd K-pop for<br>the internet age</h1>
    <p class="tag">Miami Jambo is the home of <strong>KPlop</strong> — original parody K-pop where every
    song turns one very online trend into a candy-coated, bilingual banger.</p>
    <div class="cta">
      <a class="btn btn-yt" href="music.html">Browse the releases</a>
      <a class="btn btn-ghost" href="%(yt)s" target="_blank" rel="noopener">Watch on YouTube</a>
    </div>
  </div>
</section>

<section id="about">
  <div class="wrap">
    <div class="section-head">
      <h2>What is <span class="em">KPlop</span>?</h2>
      <p class="lead">Ten fictional K-pop acts. Ten internet obsessions. One studio turning both into songs
      that are far catchier than they have any right to be.</p>
    </div>
    <div class="pillars">
      <div class="pill">
        <div class="ico">&#127908;</div>
        <h3>Original songs</h3>
        <p>Every track is written and produced from scratch — a fresh hook, a genre, and a fully invented
        idol group behind it. Hyperpop, disco-funk, trap-R&amp;B, festival EDM and cinematic OST ballads.</p>
      </div>
      <div class="pill">
        <div class="ico">&#127760;</div>
        <h3>Very online themes</h3>
        <p>Delulu manifesting, doomscrolling, the "clean girl" 5AM routine, dating by follower count,
        crypto to the moon. If it lives in your feed, there is a KPlop anthem for it.</p>
      </div>
      <div class="pill">
        <div class="ico">&#127472;&#127479;</div>
        <h3>Bilingual by design</h3>
        <p>English hooks over Korean verses, with burned-in karaoke subtitles so you can sing along in
        both. Released as full videos and vertical Shorts.</p>
      </div>
    </div>
  </div>
</section>

<section class="alt">
  <div class="wrap">
    <div class="section-head">
      <h2>Latest <span class="em">releases</span></h2>
      <p class="lead">The three most recent singles. Every release has its own page with the video,
      the concept, the act behind it and the production notes.</p>
    </div>
    <div class="grid">
%(cards)s    </div>
    <p style="text-align:center; margin-top:34px">
      <a class="btn btn-yt" href="music.html">See all ten releases &rarr;</a>
    </p>
  </div>
</section>

<section>
  <div class="wrap narrow">
    <div class="section-head">
      <h2>Where to <span class="em">watch &amp; follow</span></h2>
      <p class="lead">New KPlop drops land on YouTube as full videos and vertical Shorts, and on TikTok.
      Come for the delulu, stay for the garlic noodles.</p>
    </div>
    <div class="cta">
      <a class="btn btn-yt" href="%(yt)s" target="_blank" rel="noopener">YouTube — Miami Jambo</a>
      <a class="btn btn-tt" href="%(tt)s" target="_blank" rel="noopener">TikTok — @jamesderuyter</a>
    </div>
  </div>
</section>
""" % dict(yt=YT_CHANNEL, tt=TIKTOK,
           cards="".join(card(s) for s in list(reversed(songs))[:3]))
home += foot()
write("index.html", home)

# ---------------------------------------------------------------- music
music = head(
    "Music — every KPlop release | Miami Jambo",
    "The full KPlop discography: ten original parody K-pop singles, each with its own release page, "
    "video, concept notes and fictional idol act.",
    nav_on="music",
)
music += """
<div class="pagehead">
  <div class="wrap">
    <div class="crumb"><a href="index.html">Home</a> / Music</div>
    <h1>The releases</h1>
    <p>Ten singles, ten acts, ten internet obsessions. Each one is a full video with burned-in bilingual
    karaoke subtitles plus a vertical Short. Tap a release for the concept, the act, the production notes
    and the hook.</p>
  </div>
</div>

<section>
  <div class="wrap">
    <div class="grid">
%(cards)s    </div>
  </div>
</section>
""" % dict(cards="".join(card(s) for s in songs))
music += foot()
write("music.html", music)

# ---------------------------------------------------------------- artists
acts = "".join("""      <div class="act">
        <div class="name">%(num)s &middot; %(act)s</div>
        <div class="ko">%(ko)s &mdash; %(desc)s</div>
        <p>%(concept)s</p>
        <a href="releases/%(slug)s.html">Their single: %(title)s &rarr;</a>
      </div>
""" % dict(num=s["num"], act=esc(s["act_en"]), ko=esc(s["act_ko"]), desc=esc(s["act_desc"]),
           concept=esc(s["concept"]), slug=s["slug"], title=esc(s["title_en"])) for s in songs)

artists = head(
    "The Acts — the ten fictional idol groups of KPlop | Miami Jambo",
    "Meet the ten invented K-pop acts behind the KPlop catalogue, from rookie hyperpop group MIRAGE to "
    "cinematic OST balladeer SERAH. All fictional, all original.",
    nav_on="artists",
)
artists += """
<div class="pagehead">
  <div class="wrap">
    <div class="crumb"><a href="index.html">Home</a> / The Acts</div>
    <h1>The acts</h1>
    <p>Every KPlop single is credited to its own invented group. None of them are real: no agency, no
    trainees, no fan meets. They exist so each song can have its own concept, colour palette and attitude.</p>
  </div>
</div>

<section>
  <div class="wrap">
    <div class="roster">
%(acts)s    </div>
  </div>
</section>

<section class="alt">
  <div class="wrap narrow">
    <div class="section-head">
      <h2>Why fictional <span class="em">acts</span>?</h2>
      <p class="lead">Because parody works best when nobody real is the punchline.</p>
    </div>
    <div class="prose">
      <p>K-pop's group concepts are half the fun — the colour schemes, the lore, the rookie-of-the-year
      narrative. KPlop borrows the <em>format</em> and invents everything inside it. Every group name,
      member count and concept on this page was written for the song it fronts.</p>
      <p>That also keeps the project clean: the songs satirise internet behaviour, never a real performer.
      No existing artist, agency or label is referenced, sampled or implied, and nothing here should be
      read as being about, endorsed by, or affiliated with anyone real.</p>
    </div>
  </div>
</section>
""" % dict(acts=acts)
artists += foot()
write("artists.html", artists)

# ---------------------------------------------------------------- about
about = head(
    "About — how KPlop and Miami Jambo are made",
    "How a KPlop single gets made, from concept and bilingual lyric writing to production, cover art, "
    "karaoke subtitles and publishing on YouTube and TikTok.",
    nav_on="about",
)
about += """
<div class="pagehead">
  <div class="wrap">
    <div class="crumb"><a href="index.html">Home</a> / About</div>
    <h1>About Miami Jambo</h1>
    <p>An independent one-person music and video studio. KPlop is its flagship project: original,
    bilingual parody K-pop about the way we all behave online.</p>
  </div>
</div>

<section>
  <div class="wrap prose">
    <h2>The idea</h2>
    <p>K-pop is the most polished pop music on earth, and the internet is the least dignified place on
    earth. KPlop puts them in the same room. Each single takes one behaviour you have absolutely
    exhibited this week — manifesting a situationship, doomscrolling at 3AM, ordering the garlic noodles
    on a first date — and gives it the full idol treatment: a hook, a concept, a group, cover art and a
    video.</p>
    <p>The result sits somewhere between a joke and an actual bop, which is the target. If the song is
    only funny once, it failed. The chorus has to survive the punchline.</p>

    <h2>How a single gets made</h2>
    <ul>
      <li><strong>Concept.</strong> One trend, one angle, one title that works in both Korean and English.</li>
      <li><strong>Lyrics.</strong> Written bilingually: Korean verses carrying the story, an English hook
      that lands for listeners who do not speak Korean, and a mirrored translation woven through so both
      audiences get the same joke at the same moment.</li>
      <li><strong>The act.</strong> An invented group is designed to front the song — name, member count,
      concept, colour palette. See <a href="artists.html">the acts</a>.</li>
      <li><strong>Production.</strong> The track is produced with AI music tooling, then auditioned across
      multiple takes; the strongest performance is chosen, trimmed and mastered by hand.</li>
      <li><strong>Cover art.</strong> Each release gets its own key art in the group's palette, used as
      the video backdrop and the thumbnail.</li>
      <li><strong>Karaoke subtitles.</strong> Word-level timings are extracted from the finished vocal and
      burned into the video, so both the Korean and the English scroll in time. This is the part that takes
      the longest and the part people mention most.</li>
      <li><strong>Publishing.</strong> Every release ships twice: a full-length video and a vertical cut
      for Shorts and TikTok.</li>
    </ul>

    <h2>AI, honestly</h2>
    <p>KPlop is openly an AI-assisted project. Concepts, lyrics, structure, arrangement direction, editing
    and the final choice of every take are human decisions; music generation and cover art use AI tooling.
    Nothing here is presented as the work of a real performer, and every act is labelled fictional on
    <a href="artists.html">the acts page</a> and in each video's description.</p>

    <h2>Publishing and automation</h2>
    <p>Miami Jambo publishes to its own channels through the official platform APIs — the YouTube Data API
    for videos and Shorts, and the TikTok Content Posting API for the vertical cuts. The tooling exists for
    one reason: a release means uploading the same video, title, description and caption set to several
    places at once, and doing that by hand is how metadata ends up inconsistent.</p>
    <p>The integration is strictly first-party. It authenticates as Miami Jambo, uploads only videos this
    studio created, and posts only to Miami Jambo's own accounts. It does not read, collect, scrape or
    republish anyone else's content, and it is not offered to third parties as a service. See the
    <a href="privacy.html">privacy policy</a> for exactly what data that involves.</p>

    <h2>The parody line</h2>
    <p>Every group, idol, lyric and storyline in KPlop is original and fictional. No real artist, song,
    agency or label is sampled, named, impersonated or implied, and the project is not affiliated with or
    endorsed by anyone in the industry it is affectionately making fun of.</p>

    <h2>Elsewhere</h2>
    <p>Miami Jambo also publishes mobile games and apps under the same name. For music enquiries, use
    <a href="mailto:%(em)s">%(em)s</a> — more on the <a href="contact.html">contact page</a>.</p>
  </div>
</section>
""" % dict(em=EMAIL)
about += foot()
write("about.html", about)

# ---------------------------------------------------------------- contact
contact = head(
    "Contact & press — Miami Jambo",
    "Contact Miami Jambo for music, press, collaboration or rights enquiries, plus FAQs and brand assets.",
    nav_on="contact",
)
contact += """
<div class="pagehead">
  <div class="wrap">
    <div class="crumb"><a href="index.html">Home</a> / Contact</div>
    <h1>Contact &amp; press</h1>
    <p>One inbox, answered by a human, usually within a couple of days.</p>
  </div>
</div>

<section>
  <div class="wrap prose">
    <h2>Get in touch</h2>
    <p>Everything — press, collaborations, sync and licensing questions, rights queries, corrections, or
    "please explain the garlic noodles song" — goes to
    <a href="mailto:%(em)s">%(em)s</a>.</p>
    <p>Please put the topic in the subject line (press / licensing / rights / other). There is no phone
    line and no contact form; email is the only channel, and nothing on this site asks you to create an
    account or log in.</p>

    <h2>Follow the releases</h2>
    <p>
      <a class="btn btn-yt" href="%(yt)s" target="_blank" rel="noopener">YouTube — Miami Jambo</a>
      &nbsp;
      <a class="btn btn-tt" href="%(tt)s" target="_blank" rel="noopener">TikTok — @jamesderuyter</a>
    </p>

    <h2>Brand assets</h2>
    <p>For write-ups and playlists, the KPlop logo is available at
      <a href="icon-512.png">512&times;512</a> and <a href="icon-1024.png">1024&times;1024</a>.
      Release key art can be reused for editorial coverage — the full set is linked from each
      <a href="music.html">release page</a>. Please credit "Miami Jambo".</p>

    <h2>Frequently asked</h2>
    <div class="qa">
      <h3>Are these real K-pop groups?</h3>
      <p>No. Every act is invented for the song it fronts, and every lyric is original. KPlop is a parody
      project — see <a href="artists.html">the acts</a>.</p>
    </div>
    <div class="qa">
      <h3>Can I use a KPlop song in my video?</h3>
      <p>Email first. Short-form use with credit and a link back is usually fine; commercial use needs
      written permission. The <a href="terms.html">terms of service</a> cover the details.</p>
    </div>
    <div class="qa">
      <h3>Are the songs on Spotify or Apple Music?</h3>
      <p>Not yet. Everything currently lives on the YouTube channel as full videos and Shorts, plus the
      vertical cuts on TikTok.</p>
    </div>
    <div class="qa">
      <h3>Do you collect any of my data?</h3>
      <p>This site sets no cookies, runs no analytics and has no accounts. Full detail in the
      <a href="privacy.html">privacy policy</a>.</p>
    </div>
    <div class="qa">
      <h3>Something here is wrong or infringes my rights — who do I tell?</h3>
      <p>Email <a href="mailto:%(em)s">%(em)s</a> with the specifics and it will be reviewed and, where
      warranted, taken down. Rights and takedown handling is described in the
      <a href="terms.html">terms</a>.</p>
    </div>
  </div>
</section>
""" % dict(em=EMAIL, yt=YT_CHANNEL, tt=TIKTOK)
contact += foot()
write("contact.html", contact)

# ---------------------------------------------------------------- releases
for i, s in enumerate(songs):
    prev_s = songs[i - 1] if i > 0 else None
    next_s = songs[i + 1] if i < len(songs) - 1 else None

    sound_list = "".join('<span class="tagx">%s</span>' % esc(b) for b in s["sound"][:8])
    chorus = "\n".join(esc(l) for l in s["chorus"])

    page = head(
        "%s (%s) — KPlop by %s | Miami Jambo" % (s["title_en"], s["title_ko"], s["act_en"]),
        "%s — KPlop single %s, credited to fictional act %s. %s" % (
            s["title_en"], s["num"], s["act_en"], s["concept"].replace("*", "")[:110]),
        up="../",
        nav_on="music",
    )
    page += """
<div class="pagehead">
  <div class="wrap">
    <div class="crumb"><a href="../index.html">Home</a> / <a href="../music.html">Music</a> / %(title)s</div>
    <h1>%(title)s</h1>
    <p>%(ko)s &middot; Single %(num)s of 10 &middot; performed by <a href="../artists.html">%(act)s</a></p>
  </div>
</div>

<section>
  <div class="wrap">
    <div class="release-top">
      <div>
        <div class="videobox">
          <iframe src="https://www.youtube-nocookie.com/embed/%(video)s" title="%(title)s — official video"
            loading="lazy" allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowfullscreen></iframe>
        </div>
        <p style="margin-top:14px">
          <a class="btn btn-yt" href="https://www.youtube.com/watch?v=%(video)s" target="_blank" rel="noopener">Watch the full video</a>
          &nbsp;
          <a class="btn btn-tt" href="https://www.youtube.com/shorts/%(short)s" target="_blank" rel="noopener">Watch the Short</a>
        </p>
      </div>
      <div class="facts">
        <img src="../%(cover)s" alt="%(title)s cover art" style="width:100%%; border-radius:10px; display:block; margin-bottom:18px">
        <dl>
          <dt>Track</dt><dd>%(num)s of 10</dd>
          <dt>Act</dt><dd>%(act)s (%(act_ko)s)</dd>
          <dt>Genre</dt><dd>%(genre)s</dd>
          <dt>Tempo</dt><dd>%(bpm)s BPM</dd>
          <dt>Language</dt><dd>Korean verses, English hook</dd>
          <dt>Formats</dt><dd>Full video + vertical Short</dd>
          <dt>Subtitles</dt><dd>Burned-in bilingual karaoke</dd>
        </dl>
      </div>
    </div>

    <div class="prose">
      <h2>The concept</h2>
      <p>%(concept)s</p>

      <h2>The act</h2>
      <p><strong>%(act)s</strong> (%(act_ko)s) — %(act_desc)s. Like every KPlop group, they are entirely
      fictional: invented for this single, with a concept built to match its subject matter. More on
      <a href="../artists.html">the acts page</a>.</p>

      <h2>The sound</h2>
      <p>%(genre)s at %(bpm)s BPM, with an English hook riding over Korean verses. The production brief:</p>
      <p>%(sounds)s</p>

      <h2>The hook</h2>
      <div class="lyric">%(chorus)s</div>
      <p>Original lyric, written for this release. The full text scrolls as burned-in karaoke subtitles in
      both languages throughout the video.</p>

      <h2>Release notes</h2>
      <ul>
        <li>Written, produced and published by Miami Jambo.</li>
        <li>Released on the Miami Jambo YouTube channel as a full video and a vertical Short, with the same
        cut published to TikTok.</li>
        <li>Key art created for this single in the act's palette; it doubles as the video backdrop.</li>
        <li>Parody release — the group, the lyric and the storyline are original and fictional.</li>
      </ul>
    </div>

    <div class="pager">
      <div>%(prev)s</div>
      <div>%(next)s</div>
    </div>
  </div>
</section>
""" % dict(
        title=esc(s["title_en"]), ko=esc(s["title_ko"]), num=s["num"], act=esc(s["act_en"]),
        act_ko=esc(s["act_ko"]), act_desc=esc(s["act_desc"]), genre=s["genre"], bpm=s["bpm"],
        video=s["video"], short=s["short"], cover=s["cover"], concept=esc(s["concept"]),
        sounds=sound_list, chorus=chorus,
        prev=('<a href="%s.html">&larr; %s</a>' % (prev_s["slug"], esc(prev_s["title_en"]))) if prev_s else '<a href="../music.html">&larr; All releases</a>',
        next=('<a href="%s.html">%s &rarr;</a>' % (next_s["slug"], esc(next_s["title_en"]))) if next_s else '<a href="../music.html">All releases &rarr;</a>',
    )
    page += foot(up="../")
    write("releases/%s.html" % s["slug"], page)

print("done")
