// Page behaviour: contour backgrounds, the floating nav, and scroll reveal.
(function () {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Contour lines around three "cluster" centres, drawn into every [data-contours] svg
    const centres = [[260, 250, 1.0], [1180, 190, 0.8], [900, 760, 1.15]];
    let paths = '';
    centres.forEach(([cx, cy, scale], c) => {
        for (let ring = 1; ring <= 7; ring++) {
            const base = ring * 46 * scale;
            let d = '';
            for (let i = 0; i <= 64; i++) {
                const a = (i / 64) * Math.PI * 2;
                const r = base * (1 + 0.16 * Math.sin(a * 3 + c * 2 + ring * 0.35) + 0.08 * Math.cos(a * 5 - c));
                d += `${i ? 'L' : 'M'}${(cx + Math.cos(a) * r * 1.25).toFixed(1)} ${(cy + Math.sin(a) * r).toFixed(1)}`;
            }
            paths += `<path d="${d}Z"/>`;
        }
    });
    document.querySelectorAll('[data-contours]').forEach((svg) => { svg.innerHTML = paths; });

    const EASE = 'cubic-bezier(0.16, 1, 0.3, 1)';
    // Motion below is tuned per 60Hz frame; this turns a rAF timestamp into how many such frames passed,
    // so 120Hz screens get smaller, smoother steps instead of everything running twice as fast.
    // Capped so a stalled tab doesn't make things jump.
    const ticker = () => { let last = 0; return (now) => { const t = last ? Math.min(3, (now - last) / (1000 / 60)) : 1; last = now; return t; }; };
    const nav = document.querySelector('.nav');
    const menuBtn = nav.querySelector('.nav-menu-btn');
    const pieces = [nav.querySelector('.nav-brand'), nav.querySelector(':scope > nav'), nav.querySelector('.nav-end')];
    const drop = nav.querySelector('.nav-drop');
    const links = [...nav.querySelectorAll('.nav-links a[href^="#"]')].filter((a) => !a.closest('.nav-links-contact'));
    const sections = links.map((a) => document.querySelector(a.getAttribute('href')));

    const setOpen = (open) => {
        nav.classList.toggle('is-open', open);
        menuBtn.setAttribute('aria-expanded', open);
        menuBtn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
        menuBtn.innerHTML = `<i class="fa-solid ${open ? 'fa-xmark' : 'fa-bars'}"></i>`;
    };

    // Split/merge the pill. justify-self can't transition, so slide each piece from where it was (FLIP).
    let scrolled = null;
    const setScrolled = (on) => {
        if (on === scrolled) return;
        const first = pieces.map((p) => p.getBoundingClientRect().left);
        nav.classList.toggle('is-scrolled', on);
        if (scrolled !== null && !reduced) {
            pieces.forEach((p, i) => {
                const dx = first[i] - p.getBoundingClientRect().left;
                if (dx) p.animate([{ transform: `translateX(${dx}px)` }, { transform: 'none' }], { duration: 1000, easing: EASE });
            });
        }
        scrolled = on;
        placeDrop(active, false); // the links moved with the pill
    };

    // Liquid droplet: on a move it first stretches over both links, then pulls into the new one.
    let active = -1;
    const placeDrop = (i, animate) => {
        drop.classList.toggle('is-on', i >= 0);
        if (i < 0) return;
        const to = { left: links[i].offsetLeft, width: links[i].offsetWidth };
        const from = { left: drop.offsetLeft, width: drop.offsetWidth };
        drop.style.left = to.left + 'px';
        drop.style.width = to.width + 'px';
        if (!animate || reduced || !from.width) return;
        const l = Math.min(from.left, to.left);
        const stretch = { left: l + 'px', width: Math.max(from.left + from.width, to.left + to.width) - l + 'px', transform: 'scaleY(0.82)' };
        drop.animate([
            { left: from.left + 'px', width: from.width + 'px', transform: 'scaleY(1)' },
            { ...stretch, offset: 0.45 },
            { left: to.left + 'px', width: to.width + 'px', transform: 'scaleY(1.08)', offset: 0.8 },
            { left: to.left + 'px', width: to.width + 'px', transform: 'scaleY(1)' },
        ], { duration: 900, easing: EASE });
    };
    const setActive = (i) => {
        if (i === active) return;
        links.forEach((a, j) => (j === i ? a.setAttribute('aria-current', 'true') : a.removeAttribute('aria-current')));
        placeDrop(i, active >= 0);
        active = i;
    };

    const onScroll = () => {
        setScrolled(scrollY > 40);
        // the section whose top has passed 40% of the screen; none while on the hero or in Contact
        const line = innerHeight * 0.4;
        let i = -1;
        sections.forEach((s, j) => { if (s.getBoundingClientRect().top <= line) i = j; });
        if (document.getElementById('contact').getBoundingClientRect().top <= line) i = -1;
        setActive(i);
    };
    onScroll();
    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('resize', () => placeDrop(active, false));
    document.fonts?.ready.then(() => placeDrop(active, false)); // link widths change once the font loads
    menuBtn.addEventListener('click', () => setOpen(!nav.classList.contains('is-open')));
    nav.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => setOpen(false)));
    addEventListener('keydown', (e) => e.key === 'Escape' && setOpen(false));

    // Cat: sits until the mouse wanders far enough, then chases it with momentum (speeds up, turns
    // smoothly, slows down on arrival) and sits again a little short of it. Mouse only, not with reduced motion.
    const cat = document.querySelector('.cat');
    if (cat && !reduced && matchMedia('(pointer: fine)').matches) {
        const START = 120;   // how far the mouse must get before the cat gets up, px
        const STOP = 34;     // how close the cat runs before sitting down, px
        const MAX_SPEED = 5; // px per 60Hz frame (300px/s), whatever the screen refresh rate
        const STEER = 0.1;   // how quickly the velocity turns toward the mouse (0..1)
        const STRIDE = 6;    // px travelled per animation frame, so the legs keep pace with the speed
        const img = cat.querySelector('img');
        // each run direction has 3 frames, played 1-2-1-3 so the legs alternate
        const RUNS = ['run-right', 'run-down-left', 'run-up', 'run-down'];
        const CYCLE = [1, 2, 1, 3];
        // preload every frame so switching never flashes an empty sprite
        ['sit', ...RUNS.flatMap((r) => [1, 2, 3].map((i) => `${r}-${i}`))].forEach((f) => { new Image().src = `img/cat/${f}.png`; });
        // run-right faces right and run-down-left faces left; the other side reuses them mirrored
        const pick = (dx, dy) => {
            if (Math.abs(dy) > 2 * Math.abs(dx)) return [dy < 0 ? 'run-up' : 'run-down', 1];
            if (dy > 0.4 * Math.abs(dx)) return ['run-down-left', dx < 0 ? 1 : -1];
            return ['run-right', dx < 0 ? -1 : 1];
        };
        let frame = 'sit';
        const show = (f, dir) => {
            if (f !== frame) { img.src = `img/cat/${f}.png`; frame = f; }
            cat.style.setProperty('--dir', dir);
        };
        // body motion layered on the sprite: bounce, squash/stretch and lean, all scaled by speed
        const pose = (bob = 0, sx = 1, sy = 1, tilt = 0) => {
            img.style.setProperty('--bob', `${bob}px`);
            img.style.setProperty('--sx', sx);
            img.style.setProperty('--sy', sy);
            img.style.setProperty('--tilt', `${tilt}deg`);
        };
        const NOTICE_MS = 220; // the startled hop before it starts running
        const DUST_EVERY = 22; // px travelled between dust puffs
        let lastDust = 0;
        const dust = (x, y, back) => {
            if (document.querySelectorAll('.cat-dust').length > 10) return;
            const d = document.createElement('span');
            d.className = 'cat-dust';
            d.style.transform = `translate(${x}px, ${y}px)`;
            d.style.setProperty('--drift', `${back * (6 + Math.random() * 8)}px`);
            setTimeout(() => d.remove(), 700); // a timer, not animationend, so a stalled animation can't leave puffs behind
            document.body.append(d);
        };

        let mx = 0, my = 0, cx = -60, cy = innerHeight, vx = 0, vy = 0, stride = 0, chasing = false, startAt = 0, catRaf = 0;
        let tick = ticker();
        const walk = (now) => {
            const t = tick(now);
            const dx = mx - cx, dy = my - cy, dist = Math.hypot(dx, dy);
            if (!chasing && dist > START) {
                chasing = true;
                startAt = performance.now() + NOTICE_MS;
                img.animate([{ translate: '-50% 0' }, { translate: '-50% -12px', offset: 0.4 }, { translate: '-50% 0' }],
                    { duration: NOTICE_MS, easing: 'ease-out' });
            }
            // +1: steering lags the direction, so the distance only creeps toward STOP and may never reach it
            if (chasing && dist <= STOP + 1) {
                chasing = false; vx = vy = 0;
                // land: a quick squash as it sits down
                img.animate([{ scale: '1.15 0.82' }, { scale: '0.95 1.06', offset: 0.5 }, { scale: '1 1' }], { duration: 260, easing: 'ease-out' });
            }
            cat.classList.toggle('is-running', chasing);
            if (chasing && performance.now() < startAt) {
                show('sit', mx < cx ? -1 : 1); // looks toward the mouse mid-hop
            } else if (chasing) {
                // the speed it wants: fast when far, easing off near the stop distance
                const want = Math.min(MAX_SPEED, 1 + (dist - STOP) * 0.04);
                const steer = 1 - Math.pow(1 - STEER, t);
                vx += ((dx / dist) * want - vx) * steer;
                vy += ((dy / dist) * want - vy) * steer;
                const speed = Math.hypot(vx, vy);
                // never run past the stop distance in one frame
                const k = t * Math.min(1, (dist - STOP) / (speed * t));
                cx += vx * k;
                cy += vy * k;
                stride += speed * k;
                const [run, dir] = pick(vx, vy);
                show(`${run}-${CYCLE[Math.floor(stride / STRIDE) % CYCLE.length]}`, dir);
                // one bounce per two frames; stronger the faster it runs
                const f = Math.min(1, speed / MAX_SPEED);
                const phase = (stride / STRIDE) * Math.PI / 2;
                const s = Math.sin(phase);
                // side-on sprites lean nose-up when climbing and nose-down when descending
                const tilt = run === 'run-right' ? (vy / speed) * 14 * Math.sign(vx || 1) : 0;
                pose(-Math.abs(s) * 4 * f, 1 + 0.07 * s * f, 1 - 0.07 * s * f, tilt);
                if (speed > 2 && stride - lastDust > DUST_EVERY) {
                    lastDust = stride;
                    dust(cx - Math.sign(vx) * 8, cy - 2, -Math.sign(vx));
                }
            } else {
                show('sit', 1);
                pose();
            }
            cat.style.transform = `translate(${cx}px, ${cy}px)`; // the sprite stands bottom-centre on this point
            catRaf = chasing ? requestAnimationFrame(walk) : 0;
            if (!catRaf) tick = ticker(); // next run starts fresh, not with the idle gap as its first step
        };
        addEventListener('mousemove', (e) => {
            mx = e.clientX; my = e.clientY + 16;
            if (!cat.classList.contains('is-on')) { cx = mx - 80; cy = my; chasing = false; vx = vy = 0; cat.classList.add('is-on'); }
            if (!catRaf) catRaf = requestAnimationFrame(walk);
        }, { passive: true });
        document.documentElement.addEventListener('mouseleave', () => cat.classList.remove('is-on'));
    }

    // Smooth scroll: the wheel sets a target and the page eases toward it. Touch and keyboard stay native.
    if (!reduced) {
        const maxY = () => document.documentElement.scrollHeight - innerHeight;
        let target = scrollY, current = scrollY, raf = 0, tick = ticker();
        const step = (now) => {
            current += (target - current) * (1 - Math.pow(0.9, tick(now)));
            if (Math.abs(target - current) < 0.5) current = target;
            scrollTo({ top: current, behavior: 'instant' });
            raf = current === target ? 0 : requestAnimationFrame(step);
            if (!raf) tick = ticker();
        };
        const glideTo = (y) => {
            target = Math.max(0, Math.min(maxY(), y));
            if (!raf) { current = scrollY; raf = requestAnimationFrame(step); }
        };
        addEventListener('wheel', (e) => {
            if (e.ctrlKey || e.defaultPrevented) return; // pinch-zoom
            e.preventDefault();
            glideTo((raf ? target : scrollY) + e.deltaY * (e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? innerHeight : 1));
        }, { passive: false });
        // scrollbar drags, keys and touch move the page without us: start from there next time
        addEventListener('scroll', () => { if (!raf) target = current = scrollY; }, { passive: true });
        // the skip link keeps its native jump, so keyboard focus moves with it
        document.querySelectorAll('a[href^="#"]:not(.skip-link)').forEach((a) => a.addEventListener('click', (e) => {
            const el = document.querySelector(a.getAttribute('href'));
            if (!el) return;
            e.preventDefault();
            glideTo(a.getAttribute('href') === '#top' ? 0 : el.getBoundingClientRect().top + scrollY - 88);
            history.pushState(null, '', a.getAttribute('href'));
        }));
    }

    // Scroll reveal: content is only hidden once .reveal-ready is set, so it stays visible without JS
    if (reduced || !('IntersectionObserver' in window)) return;
    document.documentElement.classList.add('reveal-ready');
    const io = new IntersectionObserver((entries) => {
        entries.forEach((e) => {
            if (!e.isIntersecting) return;
            e.target.classList.add('is-visible');
            io.unobserve(e.target);
        });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
    document.querySelectorAll('[data-reveal]').forEach((el) => io.observe(el));
})();
