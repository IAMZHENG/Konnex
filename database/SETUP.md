# การตั้งค่า Database + Hosting (ฟรีทั้งคู่)

ขั้นตอนนี้ต้อง**สร้างบัญชี** ซึ่งเป็นสิ่งที่ Claude ทำแทนคุณไม่ได้ครับ (นโยบายความปลอดภัย)
ทำตามด้านล่างนี้ทีละขั้น แล้วเอาค่าที่ได้กลับมาบอกในแชท ผมจะเอาไปต่อให้

---

## ส่วนที่ 1 — Database: Supabase (ฟรี)

1. ไปที่ **[supabase.com](https://supabase.com)** → กด **Start your project** → สมัครด้วยอีเมลหรือ GitHub
2. กด **New project** ตั้งชื่อ (เช่น `konnex`) เลือก region ที่ใกล้ที่สุด (Singapore) ตั้งรหัสผ่าน database ไว้ (เก็บไว้ที่ปลอดภัย ไม่ต้องส่งให้ผม)
3. รอสร้างโปรเจกต์เสร็จ (~2 นาที) แล้วไปที่เมนู **SQL Editor** ทางซ้าย
4. เปิดไฟล์ `database/schema.sql` ในโปรเจกต์นี้ → copy ทั้งไฟล์ → วางใน SQL Editor → กด **Run**
   ตารางทั้งหมด (profiles, posts, quotes, messages, ...) จะถูกสร้างพร้อม Row Level Security ทันที
5. ไปที่ **Project Settings → API** → คัดลอกสองค่านี้มาบอกผม:
   - **Project URL** (หน้าตาเป็น `https://xxxxx.supabase.co`)
   - **anon public key** (ยาวๆ ขึ้นต้นด้วย `eyJ...`)

   ค่าทั้งสองนี้**ปลอดภัยที่จะฝังในโค้ดฝั่งหน้าเว็บ** — มันถูกออกแบบมาให้เป็นสาธารณะ (RLS ในข้อ 4 คือด่านที่ป้องกันข้อมูลจริง ไม่ใช่การซ่อนคีย์)

   ⚠️ **อย่าคัดลอก `service_role` key มาให้ผมเด็ดขาด** — ตัวนั้นข้าม RLS ได้ทั้งหมด ต้องเก็บเป็นความลับ ไม่ใช้ฝั่งหน้าเว็บ

---

## ส่วนที่ 2 — ที่เก็บไฟล์รูป/เอกสาร: Supabase Storage (ฟรี รวมอยู่ในแพ็กเดียวกัน)

1. ในโปรเจกต์ Supabase เดียวกัน ไปที่เมนู **Storage** → กด **New bucket**
2. สร้าง bucket ชื่อ `post-images` ตั้งเป็น **Public bucket**
3. สร้างอีกอันชื่อ `attachments` ตั้งเป็น **Public bucket** เช่นกัน (ไฟล์ pdf/xlsx ที่แนบ)

---

## ส่วนที่ 3 — Hosting: Cloudflare Pages (ฟรี)

แนะนำ Cloudflare Pages เพราะแอปนี้เป็นไฟล์ static (HTML/JS/รูป) ล้วนๆ ไม่มี build step — วิธีที่ง่ายที่สุดคือ **ลากไฟล์วางตรงๆ** ไม่ต้องมี GitHub เลยก็ได้:

1. ไปที่ **[pages.cloudflare.com](https://pages.cloudflare.com)** → สมัครบัญชี Cloudflare (ฟรี)
2. กด **Create a project** → เลือกแท็บ **Upload assets** (ไม่ใช่ Connect to Git)
3. ลากทั้งโฟลเดอร์ `Project Konnex` (มี `index.html` และ `assets/`) วางลงไป
4. กด Deploy — จะได้ลิงก์ทันที เช่น `konnex.pages.dev`

ถ้าอยากได้ auto-deploy ทุกครั้งที่แก้โค้ด (ผ่าน GitHub) บอกผมได้ ผมจะ `git init` และเตรียม repo ให้ แล้วคุณแค่เชื่อม GitHub เข้ากับ Cloudflare Pages ในหน้าตั้งค่า

**ทางเลือกอื่นที่ฟรีเหมือนกัน** ถ้าไม่ชอบ Cloudflare: [Netlify](https://netlify.com) (ลากวางได้เหมือนกัน) หรือ [Vercel](https://vercel.com) (เน้น GitHub-based)

---

## เอาค่ากลับมาบอกผม

พอทำครบสามส่วนแล้ว ส่งมาแค่:
1. Supabase **Project URL**
2. Supabase **anon public key**
3. ลิงก์เว็บที่ deploy ได้ (เช่น `https://konnex.pages.dev`)

ผมจะเอาไปใส่ในไฟล์ config แล้วเริ่มต่อสายฟีเจอร์แรก (สมัคร/เข้าสู่ระบบจริง → โพสต์ RFQ จริง → เสนอราคาจริง) ให้ทีละส่วน
