const { createClient } = require("redis");
const puppeteer = require("puppeteer");

const REDIS_HOST = process.env.REDIS_HOST || "localhost";
const REDIS_PORT = process.env.REDIS_PORT || 6379;
const PUPPETEER_TASKS_LIST = "puppeteer_tasks_list";
const path = require("path"); // Import path module
const fs = require("fs"); // Import fs module
let browser;
let page;
const PUPPETEER_RESPONSE_PREFIX = 'puppeteer_response:'; // Add this line at the top with other constants

const COOKIES_FILE = path.join(__dirname, "cookies.json");
const LOCAL_STORAGE_FILE = path.join(__dirname, "localStorage.json");

// IMPORTANT: Manual Login Process for ChatGPT
// Scenario: "Launch browser for manual login -> Save cookies"
// 1. Run Puppeteer Worker with headless: false (browser window will appear).
// 2. Manually log in to ChatGPT (solve Cloudflare, enter credentials).
// 3. After successful login, the Worker will automatically save cookies.json and localStorage.json.
// 4. Subsequent runs will load these saved sessions, bypassing manual login.

async function getBrowser() {
    if (!browser || !page) {
        console.log("[PUPPETEER] Initializing new browser instance...");
        browser = await puppeteer.launch({
            headless: false,   // ✅ GUI 모드
            executablePath: '/usr/bin/google-chrome-stable', // 설치된 크롬 경로
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-blink-features=AutomationControlled',
                '--disable-extensions',
                '--no-first-run'
            ]
        });
        page = await browser.newPage();
        console.log("[PUPPETEER] Browser instance created.");
    }
    return page;
}

async function executeTask(task, redisClient) {
    console.log(`[PUPPETEER] Executing task: ${task.type}`, task);

    const page = await getBrowser();

    if (task.type === "healthcheck") {
        console.log("[PUPPETEER]  Running full Puppeteer healthcheck...");
        try {
            console.log("[PUPPETEER] Attempting to launch browser...");
            const browser = await puppeteer.launch({
                headless: false,
                executablePath: '/usr/bin/google-chrome-stable',
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage'
                ]
            });
            console.log("[PUPPETEER] Browser launched successfully.");

            console.log("[PUPPETEER] Creating new page...");
            const page = await browser.newPage();
            console.log("[PUPPETEER] Page created.");

            console.log("[PUPPETEER] Navigating to about:blank...");
            await page.goto("about:blank");
            console.log("[PUPPETEER] Navigated to about:blank.");

            console.log("[PUPPETEER] Setting healthcheck result to Redis (OK)...");
            await redisClient.set(`puppeteer_healthcheck_result:${task.id}`, JSON.stringify({
                status: "ok",
                message: `Puppeteer launched successfully and navigated to about:blank.`,
                timestamp: new Date().toISOString()
            }), { EX: 15 });
            console.log("[PUPPETEER] Healthcheck result set to Redis (OK).");

            console.log("[PUPPETEER] Closing browser...");
            await browser.close();
            console.log("[PUPPETEER] Browser closed.");
        } catch (err) {
            console.error("[PUPPETEER] ❌ Healthcheck failed:", err);
            console.log("[PUPPETEER] Setting healthcheck result to Redis (ERROR)...");
            await redisClient.set(`puppeteer_healthcheck_result:${task.id}`, JSON.stringify({
                status: "error",
                message: err.message,
                timestamp: new Date().toISOString()
            }), { EX: 15 });
            console.log("[PUPPETEER] Healthcheck result set to Redis (ERROR).");
        }
        return;
    }

    if (task.type === "manual_login_setup") {
        console.log("[PUPPETEER] Starting manual login setup...");
        console.log("[PUPPETEER] Navigating to ChatGPT for manual login...");
        await page.goto("https://chat.openai.com/", { waitUntil: 'domcontentloaded' });

        console.log("[PUPPETEER] Please login manually in the opened browser...");
        await page.waitForSelector('div.flex.min-w-0.grow.items-center', { timeout: 0 });
        console.log("✅ Login successful - Account name detected.");

        // Save cookies (필요 없는 필드 제거)
        const cookies = await page.cookies();
        const filteredCookies = cookies.map(({ 
            name, value, domain, path, expires, httpOnly, secure, sameSite 
        }) => ({
            name, value, domain, path, expires, httpOnly, secure, sameSite
        }));
        fs.writeFileSync(COOKIES_FILE, JSON.stringify(filteredCookies, null, 2));

        // Save localStorage
        const localStorageData = await page.evaluate(() => {
            let data = {};
            for (let i = 0; i < localStorage.length; i++) {
                let key = localStorage.key(i);
                data[key] = localStorage.getItem(key);
            }
            return data;
        });
        fs.writeFileSync(LOCAL_STORAGE_FILE, JSON.stringify(localStorageData, null, 2));

        console.log("✅ Session saved automatically.");
        return; // Exit after setup
    } else if (task.type === "dom_crawl") {
        const { url, task_id } = task.payload;
        console.log(`[PUPPETEER] Crawling DOM for URL: ${url} (Task ID: ${task_id})...`);

        try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
            console.log(`[PUPPETEER] Page loaded. Waiting extra 5s for SPA render...`);
            await new Promise(r => setTimeout(r, 5000));  // ChatGPT는 SPA라서 추가 대기 필요

            const elements = await page.evaluate(() => {
                const all = [];
                document.querySelectorAll("*").forEach((el) => {
                    try {
                        all.push({
                            tag: el.tagName.toLowerCase(),
                            id: el.id || null,
                            classes: el.className ? el.className.split(" ") : null,
                            selector: (() => {
                                let selector = el.tagName.toLowerCase();
                                if (el.id) selector += "#" + el.id;
                                if (el.className) selector += "." + el.className.split(" ").join(".");
                                return selector;
                            })(),
                            text: el.innerText ? el.innerText.slice(0, 100) : null,
                            attributes: Array.from(el.attributes).map(attr => ({ name: attr.name, value: attr.value }))
                        });
                    } catch (e) {}
                });
                return all;
            });

            console.log(`[PUPPETEER] Extracted ${elements.length} elements.`);
            await redisClient.set(`puppeteer_domdump:${task_id}`, JSON.stringify(elements), { EX: 300 });
            console.log(`[PUPPETEER] Stored DOM dump for task ${task_id} in Redis.`);
        } catch (error) {
            console.error(`[PUPPETEER] Error during DOM crawl for ${url}:`, error);

            // 전체 에러를 문자열로 직렬화
            const errorDetails = {
                name: error.name || "Error",
                message: error.message || "Unknown error",
                stack: error.stack || "No stack trace",
                url: url,
                timestamp: new Date().toISOString()
            };

            // Redis에 저장
            await redisClient.set(
                `puppeteer_domdump:${task_id}`,
                JSON.stringify({ elements: [], error: errorDetails }),
                { EX: 300 }
            );
        }
    } else if (task.type === "generate_image_from_prompt") {
        const { prompt, task_id } = task.payload;
        console.log(`[PUPPETEER] Generating image for prompt: "${prompt}" (Task ID: ${task_id})...`);

        try {
            // 1. Retrieve prompt from task.payload and input it
            const promptInputSelector = '#prompt-textarea'; // Assuming this is the correct selector for the input field
            await page.waitForSelector(promptInputSelector, { visible: true, timeout: 30000 });
            await page.type(promptInputSelector, prompt);
            console.log(`[PUPPETEER] Prompt entered: "${prompt}"`);

            // 2. Implement Pre-Generation Image Capture
            const beforeImgs = await page.evaluate(() => {
                const imgs = Array.from(document.querySelectorAll("img[alt='Generated image'], img[src^='blob:']"));
                return imgs.map(img => img.src);
            });
            console.log(`[PUPPETEER] Found ${beforeImgs.length} existing images before generation.`);

            // 3. Click the submit button with stability
            const submitButtonSelector = 'button[data-testid="send-button"]'; // Assuming this is the correct selector for the send button
            try {
                await page.waitForSelector(submitButtonSelector, { visible: true, timeout: 10000 });
                await page.click(submitButtonSelector);
                console.log("[PUPPETEER] Clicked submit button.");
            } catch (clickError) {
                console.warn("[PUPPETEER] Submit button click failed, trying Enter key:", clickError.message);
                await page.keyboard.press("Enter");
                console.log("[PUPPETEER] Pressed Enter key as fallback.");
            }

            // 생성 시작 기다리기 (스트리밍 중지 버튼으로 바뀔 때까지)
            await page.waitForFunction(() => {
              const btn = document.querySelector("#composer-submit-button");
              return btn && btn.getAttribute("aria-label") === "스트리밍 중지";
            }, { timeout: 300000 }); // 5분
            console.log("[PUPPETEER] Image generation started...");

            let dataUrl = null;
            let interval = null; // Declare interval outside try block for wider scope
            try {
                try {
  // 로그인 성공 후 버튼 클릭
  console.log("[PUPPETEER] Waiting for 'Send prompt' button...");
  await page.waitForSelector('#composer-submit-button[aria-label="Send prompt"]', { timeout: 60000 });
  await page.click('#composer-submit-button[aria-label="Send prompt"]');
  console.log("[PUPPETEER] Prompt sent, waiting for image generation...");

  // 2. 'Stop streaming' 버튼이 나타날 때까지 대기
  console.log("[PUPPETEER] Waiting for 'Stop streaming' button...");
  await page.waitForSelector('#composer-submit-button[aria-label="Stop streaming"]', { timeout: 60000 });
  console.log("[PUPPETEER] Image generation in progress...");

  // 20초마다 aria-label 상태를 출력 (이미지 생성 시작 후)
  interval = setInterval(async () => {
    const button = await page.$('#composer-submit-button'); // 버튼 찾기
    if (button) {
      const ariaLabel = await button.evaluate(el => el.getAttribute('aria-label'));
      console.log(`[PUPPETEER] Button aria-label: ${ariaLabel}`); // aria-label 출력
    } else {
      console.log("[PUPPETEER] Button not found."); // 버튼을 찾지 못한 경우
    }
  }, 20000); // 20초 간격으로 확인

  // 3. 이미지 생성 완료 후 'Start voice mode' 버튼이 나타날 때까지 대기
  console.log("[PUPPETEER] Waiting for 'Start voice mode' button...");
  await page.waitForSelector('button[data-testid="composer-speech-button"][aria-label="Start voice mode"]', {
    timeout: 300000, // 5분
  });
  console.log("[PUPPETEER] Generation finished, back to voice mode.");
  
} catch (error) {
  console.error("[PUPPETEER] Error during image generation:", error);
} finally {
  // 주기적인 출력 종료 (에러 발생 시에도 반드시 종료)
  if (interval) {
    clearInterval(interval);
    console.log("[PUPPETEER] Interval stopped.");
  }
}

// 네트워크 요청 확인
page.on('response', (response) => {
  console.log(`[PUPPETEER] Network response: ${response.status()} ${response.url()}`);
});

// 이미지 생성 후 상태 확인
const img = await page.$('img');  // 예시로 첫 번째 이미지를 찾음
if (img) {
  console.log("[PUPPETEER] Image found after generation.");
} else {
  console.log("[PUPPETEER] No image found after generation.");
}

                // Update Redis with post-processing status
                await redisClient.set(
                    `puppeteer_image_generation_result:${task_id}`,
                    JSON.stringify({
                        status: "processing",
                        stage: "post-processing",
                        message: "Image generation complete, post-processing started.",
                        timestamp: new Date().toISOString()
                    }),
                    { EX: 600 }
                );

                const MAX_TIMEOUT = 120000; // 최대 2분
                const CHECK_INTERVAL = 1000; // 1초마다 체크

                let isReady = false;
                const startTime = Date.now();

                console.log("[PUPPETEER] Starting DOM-based image readiness check...");

                while (Date.now() - startTime < MAX_TIMEOUT) {
                    const ready = await page.evaluate(() => {
                        const img = document.querySelector("img[alt='Generated image'], img[src^='blob:']");
                        if (!img) return false;
                        return img.complete && img.naturalHeight > 0;
                    });

                    if (ready) {
                        isReady = true;
                        console.log("[PUPPETEER] Image fully loaded (DOM check passed).");
                        break;
                    }

                    await new Promise(r => setTimeout(r, CHECK_INTERVAL));
                }

                if (!isReady) {
                    throw new Error("Image did not finish loading within timeout.");
                }
                console.log("[PUPPETEER] Image readiness check completed.");

                // Update Redis with image ready status
                await redisClient.set(
                    `puppeteer_image_generation_result:${task_id}`,
                    JSON.stringify({
                        status: "processing",
                        stage: "image_ready",
                        message: "Image is ready based on DOM properties.",
                        timestamp: new Date().toISOString()
                    }),
                    { EX: 600 }
                );

                try {
                    const MAX_TIMEOUT = 120000;
                    const CHECK_INTERVAL = 1000;
                    const startTime = Date.now();
                    let imageUrl = null;

                    while (Date.now() - startTime < MAX_TIMEOUT) {
                        imageUrl = await page.evaluate(() => {
                            const img = document.querySelector("img[alt='Generated image'], img[src^='blob:']");
                            return (img && img.complete && img.naturalHeight > 0) ? img.src : null;
                        });
                        if (imageUrl) break;
                        await page.waitForTimeout(CHECK_INTERVAL);
                    }

                    if (!imageUrl) throw new Error("Image did not finish loading within timeout.");

                    console.log("[PUPPETEER] Image fully loaded and URL extracted:", imageUrl);
                    // 여기서 URL을 직접 다운로드하거나 Redis에 저장
                } catch (waitError) {
                    console.error("[PUPPETEER] Error waiting for image:", waitError.message);
                    await redisClient.set(
                        `puppeteer_image_generation_result:${task_id}`,
                        JSON.stringify({ status: "error", error: waitError.message, timestamp: new Date().toISOString() }),
                        { EX: 600 }
                    );
                    return;
                }

            } catch (waitError) {
                console.error("[PUPPETEER] Error waiting for or extracting image:", waitError.message);
                // Report error to Redis
                await redisClient.set(
                    `puppeteer_image_generation_result:${task_id}`,
                    JSON.stringify({ status: "error", error: waitError.message, timestamp: new Date().toISOString() }),
                    { EX: 600 }
                );
                console.log(`[PUPPETEER] Image generation error for task ${task_id} reported to Redis.`);
                return; // Exit if image extraction failed
            }

            const downloadedImagePaths = [];
            if (dataUrl) {
                try {
                    // Extract base64 data from dataUrl (e.g., "data:image/png;base64,iVBORw0KGgo...")
                    const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, "");
                    const buffer = Buffer.from(base64Data, 'base64');

                    const filename = `${task_id}_0.png`; // Assuming one image per prompt for now
                    const dataDir = path.join('/app', 'data');
                    const imageSavePath = path.join(dataDir, filename);

                    if (!fs.existsSync(dataDir)) {
                        fs.mkdirSync(dataDir, { recursive: true });
                        console.log(`[PUPPETEER] Created data directory: ${dataDir}`);
                    }

                    fs.writeFileSync(imageSavePath, buffer);
                    downloadedImagePaths.push(`/data/${filename}`);
                    console.log(`[PUPPETEER] Saved image: ${imageSavePath}`);

                    // Update Redis with completed status after saving the image
                    await redisClient.set(
                        `puppeteer_image_generation_result:${task_id}`,
                        JSON.stringify({
                            status: "saved",
                            images: downloadedImagePaths,
                            timestamp: new Date().toISOString()
                        }),
                        { EX: 600 }
                    );

                } catch (saveError) {
                    console.error(`[PUPPETEER] Error saving image from canvas data:`, saveError);
                    // Report error to Redis
                    await redisClient.set(
                        `puppeteer_image_generation_result:${task_id}`,
                        JSON.stringify({ status: "error", error: saveError.message, timestamp: new Date().toISOString() }),
                        { EX: 600 }
                    );
                }
            } else {
                console.warn("[PUPPETEER] No image data URL obtained from canvas extraction.");
                // This case should ideally be caught by the earlier try/catch, but as a fallback:
                await redisClient.set(
                    `puppeteer_image_generation_result:${task_id}`,
                    JSON.stringify({ status: "error", error: "No image data URL obtained.", timestamp: new Date().toISOString() }),
                    { EX: 600 }
                );
            }
            console.log(`[PUPPETEER] Image generation results for task ${task_id} reported to Redis.`);

        } catch (error) {
            console.error(`[PUPPETEER] Error during image generation for task ${task_id}:`, error);
            const errorDetails = {
                name: error.name || "Error",
                message: error.message || "Unknown error",
                stack: error.stack || "No stack trace",
                timestamp: new Date().toISOString()
            };
            await redisClient.set(
                `puppeteer_image_generation_result:${task_id}`,
                JSON.stringify({ status: "error", error: errorDetails, timestamp: new Date().toISOString() }),
                { EX: 600 }
            );
            console.log(`[PUPPETEER] Image generation error for task ${task_id} reported to Redis.`);
        }
    } else if (task.type === "generate_pdf_from_html") {
        const { htmlContent, task_id } = task.payload;
        console.log(`[PUPPETEER] Generating PDF for task: ${task_id}...`);

        try {
            await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
            const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });

            const dataDir = path.join(__dirname, 'data'); // Use __dirname to ensure correct path within the worker
            if (!fs.existsSync(dataDir)) {
                fs.mkdirSync(dataDir, { recursive: true });
            }
            const pdfPath = path.join(dataDir, `${task_id}.pdf`);
            fs.writeFileSync(pdfPath, pdfBuffer);

            await redisClient.set(
                PUPPETEER_RESPONSE_PREFIX + task_id,
                JSON.stringify({ status: "success", pdfPath: `/data/${task_id}.pdf` }),
                { EX: 300 }
            );
            console.log(`[PUPPETEER] PDF generated and saved to ${pdfPath} for task ${task_id}.`);
        } catch (error) {
            console.error(`[PUPPETEER] Error generating PDF for task ${task_id}:`, error);
            const errorDetails = {
                name: error.name || "Error",
                message: error.message || "Unknown error",
                stack: error.stack || "No stack trace",
                timestamp: new Date().toISOString()
            };
            await redisClient.set(
                PUPPETEER_RESPONSE_PREFIX + task_id,
                JSON.stringify({ status: "error", error: errorDetails, timestamp: new Date().toISOString() }),
                { EX: 300 }
            );
            console.log(`[PUPPETEER] PDF generation error for task ${task_id} reported to Redis.`);
        }
    }


    try {

        const page = await getBrowser(); // Use the globally managed page instance

        // --- Enhanced Logging for Debugging ---
        page.on('console', msg => {
            console.log('[PUPPETEER_PAGE_LOG]', msg.text());
        });

        page.on('request', request => {
            console.log('[PUPPETEER_NETWORK_REQ]', request.method(), request.url());
        });

        page.on('response', async response => {
            console.log('[PUPPETEER_NETWORK_RES]', response.status(), response.url());
        });

        page.on('pageerror', err => {
            console.error('[PUPPETEER_PAGE_ERROR]', err.message);
        });

        browser.on('targetchanged', target => {
            console.log('[PUPPETEER_BROWSER_TARGET_CHANGED]', target.url());
        });

        browser.on('disconnected', () => {
            console.log('[PUPPETEER_BROWSER_DISCONNECTED]');
        });
        // --- End Enhanced Logging ---

        // --- Load Session (Cookies and Local Storage) ---
        console.log("[PUPPETEER] Attempting to load session from files...");
        try {
            if (fs.existsSync(COOKIES_FILE)) {
                const cookies = JSON.parse(fs.readFileSync(COOKIES_FILE, "utf8"));
                for (let cookie of cookies) {
                    // Puppeteer expects 'url' for setCookie, but it's not always present in saved cookies.
                    // Add a default URL if missing, or filter out cookies without a valid URL context.
                    if (!cookie.url && cookie.domain) {
                        cookie.url = `https://${cookie.domain.startsWith('.') ? cookie.domain.substring(1) : cookie.domain}${cookie.path}`;
                    }
                    await page.setCookie(cookie);
                }
                console.log(`[PUPPETEER] Loaded ${cookies.length} cookies from ${COOKIES_FILE}.`);
            } else {
                console.log(`[PUPPETEER] No cookies file found at ${COOKIES_FILE}.`);
            }

            if (fs.existsSync(LOCAL_STORAGE_FILE)) {
                const localStorageData = JSON.parse(fs.readFileSync(LOCAL_STORAGE_FILE, "utf8"));
                await page.evaluate(data => {
                    for (let key in data) {
                        localStorage.setItem(key, data[key]);
                    }
                }, localStorageData);
                console.log(`[PUPPETEER] Loaded local storage from ${LOCAL_STORAGE_FILE}.`);
            } else {
                console.log(`[PUPPETEER] No local storage file found at ${LOCAL_STORAGE_FILE}.`);
            }
            console.log("[PUPPETEER] Session loading complete.");
        } catch (e) {
        console.error("[PUPPETEER] Error loading session files:", e);
        console.log("[PUPPETEER] Proceeding without loaded session. Manual login might be required.");
    }

    } catch (error) {
        console.error("[PUPPETEER] An error occurred during Puppeteer execution:", error);
    } finally {
        if (browser) {
            // Browser is now managed globally and kept open for subsequent tasks.
            // It will be closed when the worker process process exits or explicitly by a shutdown hook.
        }
    }
}

function checkDataDir() {
    const dataDir = path.join('/app', 'data');
    try {
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
            console.log(`[INIT] Data directory created: ${dataDir}`);
        } else {
            console.log(`[INIT] Data directory exists: ${dataDir}`);
        }
        // 테스트 파일 쓰기/읽기
        const testFile = path.join(dataDir, 'init_check.txt');
        fs.writeFileSync(testFile, 'data-dir-ok');
        const check = fs.readFileSync(testFile, 'utf-8');
        console.log(`[INIT] Data directory write/read OK: ${check}`);
        fs.unlinkSync(testFile); // 테스트 끝나면 삭제
    } catch (err) {
        console.error(`[INIT] Data directory check failed: ${err.message}`);
        process.exit(1); // 치명적이면 컨테이너 종료 → docker logs에서 바로 확인 가능
    }
}

async function main() {
    console.log("[WORKER] Starting Puppeteer worker...");
    checkDataDir(); // Call the check here
    const redisClient = createClient({ url: `redis://${REDIS_HOST}:${REDIS_PORT}` });

    redisClient.on('error', (err) => console.log('[REDIS] Redis Client Error', err));

    await redisClient.connect();
    console.log("[REDIS] Connected to Redis successfully.");

    console.log(`[REDIS] Worker is listening for tasks on '${PUPPETEER_TASKS_LIST}'.`);

    while (true) {
        try {
            const taskJSON = await redisClient.brPop(PUPPETEER_TASKS_LIST, 0);
            if (taskJSON) {
                console.log("[REDIS] Popped task from queue:", taskJSON.element);
                const task = JSON.parse(taskJSON.element);
                await executeTask(task, redisClient);
            }
        } catch (error) {
            console.error("[WORKER] An error occurred in the main loop:", error);
            if (error.message.includes('detached Frame')) {
                console.log('[WORKER] Detached frame error detected. Resetting browser instance.');
                browser = null;
                page = null;
            }
            // Wait a bit before retrying to prevent a fast error loop
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
}

main();