# 🎓👁️ ProctorAI — Computer Vision Tracking Chat Bot

> *“This is not a test… okay wait, it literally is.”*  
> Anime-style exam energy + AI proctoring + real-time quiz + chat in one project.

---

## ✨ What is this?

**ProctorAI** is a Next.js + Supabase app that lets users:
- Join quiz rooms using a quiz ID.
- Take timed quizzes with proctoring checks.
- Chat in real-time while being monitored.
- Track violations during an exam session.

Think of it like: **Classroom of the Elite + coding + anti-cheat mode**.

---

## 🎬 Quick Visual Vibe (GIF Mode)

### 1) Entering the exam room be like:
![Anime typing GIF](https://media.giphy.com/media/13HgwGsXF0aiGY/giphy.gif)

### 2) When proctoring catches suspicious movement:
![Surprised anime GIF](https://media.giphy.com/media/LHZyixOnHwDDy/giphy.gif)

### 3) Countdown timer at 00:59:
![Panic keyboard GIF](https://media.giphy.com/media/3o7btPCcdNniyf0ArS/giphy.gif)

### 4) Submit clicked. No going back.
![Dramatic anime GIF](https://media.giphy.com/media/2H67VmB5UEBmU/giphy.gif)

---

## 🧠 Features

- 🪪 **Quiz by Room/ID flow** (join directly with quiz ID)
- ⏱️ **Timed exam experience**
- 👁️ **Proctoring violation stream**
- 💬 **Integrated chat widget**
- 🧾 **Attempt + response tracking**
- 🔐 **Supabase Auth + RLS-backed data access**

---

## 🧱 Tech Stack

- **Frontend:** Next.js 14, React, TypeScript
- **Styling:** Tailwind CSS
- **Backend/Data:** Supabase (Postgres + Auth + Storage + RLS)
- **AI/vision helpers:** MediaPipe + face-api.js

---

## 🚀 Local Setup

```bash
npm install
npm run dev
```

Open: `http://localhost:3000`

---

## 🔐 Environment Variables

Create a `.env.local` file:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

---

## 🧪 Main Routes

- `/auth/login` → login
- `/auth/register` → register
- `/quiz/join` → join quiz using ID
- `/quiz/[id]` → live quiz room
- `/admin` → admin panel

---

## 😂 Proctor Meme Corner

- “I looked away for 0.3 seconds”  
  **System:** *⚠️ Critical violation detected.*
- “Can I open one extra tab?”  
  **System:** *Absolutely. Also absolutely not.*
- “Why is the camera watching me breathe?”  
  **Because this repo believes in cardio + integrity.**

---

## 🛠️ Scripts

```bash
npm run dev     # run dev server
npm run build   # production build
npm run start   # start production server
npm run lint    # lint checks
```

---

## 📌 Notes

- Add your Supabase SQL schema and policies before testing full quiz/proctor flows.
- Ensure your quizzes are published if users should access them from join flow.
- Promote at least one admin user for quiz management.

---

## ❤️ Created by NOX

If this helped, drop a ⭐ and pass your exams with honor (and eyes on screen 👀).
