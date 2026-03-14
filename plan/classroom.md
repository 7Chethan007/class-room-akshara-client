# Page 2 — Live Classroom Page

## Navbar
**Background:** Very dark warm brown #1E1510, 1px bottom border in dark brown #3A2A20  
**Left:** "ClassRoom Live" in Fredoka One 17px, warm terracotta #D09070  
**Divider:** A 1px vertical line in dark brown, 18px tall, separating logo from subject  
**Center:** Subject name "Mathematics — Chapter 5" in Nunito 14px bold, warm off-white #E8D8C8  
**Right** (pushed via margin-left: auto): Three elements in a row:  
- A blinking red dot 8px circle, CSS animation fading between full and 40% opacity every 1.2s  
- "LIVE" label in 11px bold red #E84040  
- A monospace timer "00:34:12" in 13px muted brown, dark background pill #2A1F18, 8px border radius, 4px 10px padding  

## Main Area (70% / 30% split)

### Left — Video Area (70%)
Padding 14px, flex column with 10px gap between presenter tile and student row  

#### Presenter Tile (main video)
**Dark gradient background** from #3D2A1E to #1A1008, 16px border radius, 1.5px dark terracotta border  
**Subtle scanline overlay** — repeating horizontal lines every 40px at 2% white opacity, purely decorative  
**Top-left badge:** Dark semi-transparent pill, "● Presenter" with a red 10px dot SVG, 11px bold warm text  
**Top-right badge:** Solid terracotta #C07050 pill, "🖥 Screen Sharing" in 10px bold white  
**Center:** Circular avatar 72px, terracotta fill, white "Ms" in Fredoka One 26px, with a 3px semi-transparent white border ring  
**Bottom-left:** Presenter name "Ms. Priya Sharma" in 13px bold warm white #F0E0D0  

#### Student Tile Row
Fixed height 80px, flex row with 8px gaps  
5 named tiles + 1 overflow tile, each with 10px border radius, dark border #4A3020, dark background #2E1E14  
**Each tile:** a 28px colored circle avatar with 10px white initials, and a 9px muted name below  
**Colors:** Arjun = blue #5B7FD4, Rhea = green #6BAA7A, Nikhil = coral #D47A5B, Sneha = purple #A06BB8, Prashant = amber #D4A55B  
**Last tile** "+9 more" — dashed border, slightly lighter background, Fredoka One 11px muted brown text  

### Right — Participants Panel (30%)
Dark background #1E1510, 1px left border  

#### Panel Header
Padding 14px 16px 10px, 1px bottom border  
**"Participants"** in Fredoka One 14px warm amber #E8C8A0  
**Count badge** "14" — terracotta fill, white 11px bold, 10px border radius pill  

#### Participant List (scrollable)
10px 12px padding, 5px gap between rows  
**Section label** "INSTRUCTOR" — 10px uppercase, letter-spaced, very muted brown #6A5040  
**Instructor row** — highlighted with terracotta #C07050 border and slightly lighter dark background #2F2018  
- 28px terracotta avatar, "Ms" initials  
- "Ms. Priya Sharma" in 12px semibold warm grey  
**Section label** "STUDENTS (13)" — same style, 6px top margin  
9 visible student rows — each: 28px colored avatar + full name in 12px semibold, dark background #2A1F18, 0.5px border #3E2E22, 10px border radius, 8px 10px padding  
**"+4 more" row** — same layout but 45% opacity, grey avatar, "4 more" in 11px  

## Bottom Controls Bar
**Background** #1A110C, 1px top border, 13px padding  
All 6 buttons in a single centered flex row with 10px gaps  
**Default button style:** Dark brown background #3A2A20, 1px border #5A4030, 12px border radius, 12px Nunito semibold, warm off-white text, 9px 18px padding  
**Active state** (Mic On, Share): Faint terracotta tinted background, terracotta border #C07050, terracotta text  
**Buttons left to right:**  
- 🎤 **Mic On** — active state  
- 📷 **Camera Off** — default state  
- 🖥 **Share** — active state  
- 📝 **Transcript** — default state  
- ⏺ **Record** — default state  
- ✕ **End Class** — red fill #C03030, red border #A02020, white text — the only danger-styled button
