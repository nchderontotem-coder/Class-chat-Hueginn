"use strict";
// ========================================
// 1. SUPABASE CONNECTION
// ========================================

const SUPABASE_URL =
    "https://nuccfeirwyebdcmdszsn.supabase.co";

const SUPABASE_KEY =
    "sb_publishable_rv9mjjOrJ_uQKXCjEkCFAg_n-wVnvOf";

const sb = supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
);
// ========================================
// 2. HTML ELEMENTS
// ========================================
const onlineUsers = document.getElementById("online-users");
const authScreen = document.getElementById("auth-screen");
const chatScreen = document.getElementById("chat-screen");

const authForm = document.getElementById("auth-form");
const authMessage = document.getElementById("auth-message");
const chatMessage = document.getElementById("chat-message");

const displayName = document.getElementById("display-name");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");

const signupBtn = document.getElementById("signup-btn");
const logoutBtn = document.getElementById("logout-btn");

const who = document.getElementById("who");
const messageList = document.getElementById("messages");
const messageForm = document.getElementById("message-form");
const messageInput = document.getElementById("message-input");

// ========================================
// 3. APP STATE
// ========================================

let currentUser = null;
let channel = null;
let onlineChannel = null;
let chatStarting = false;

const names = {};

function getDisplayName(user) {
    return (
        names[user.id] ||
        user.user_metadata?.display_name ||
        user.email?.split("@")[0] ||
        "User"
    );
}

// ========================================
// 4. SIGN UP
// ========================================

async function signUp() {
    const name = displayName.value.trim();
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (name.length < 2 || name.length > 20) {
        authMessage.textContent =
            "Display name must be 2–20 characters.";
        return;
    }

    if (!email || password.length < 8) {
        authMessage.textContent =
            "Enter a valid email and a password of at least 8 characters.";
        return;
    }

    signupBtn.disabled = true;
    authMessage.textContent = "Creating your account...";

    try {
        const { data, error } = await sb.auth.signUp({
            email,
            password,
            options: {
                data: {
                    display_name: name
                }
            }
        });

        if (error) throw error;

        if (data.session) {
            authMessage.textContent = "Account created!";
        } else {
            authMessage.textContent =
                "Account created. Check your email to confirm, then log in.";
        }
    } catch (error) {
        authMessage.textContent = error.message;
    } finally {
        signupBtn.disabled = false;
    }
}

signupBtn.addEventListener("click", () => {
    if (authForm.reportValidity()) {
        signUp();
    }
});

// ========================================
// 5. LOG IN
// ========================================

authForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    authMessage.textContent = "Logging in...";

    try {
        const { error } = await sb.auth.signInWithPassword({
            email: emailInput.value.trim(),
            password: passwordInput.value
        });

        if (error) throw error;

        authMessage.textContent = "";
    } catch (error) {
        authMessage.textContent = error.message;
    }
});

// ========================================
// 6. LOG OUT
// ========================================

logoutBtn.addEventListener("click", async () => {
    logoutBtn.disabled = true;

    try {
        const { error } = await sb.auth.signOut();

        if (error) throw error;
    } catch (error) {
        chatMessage.textContent =
            "Could not log out: " + error.message;
    } finally {
        logoutBtn.disabled = false;
    }
});

// ========================================
// 7. AUTHENTICATION STATE
// ========================================

sb.auth.onAuthStateChange((event, session) => {
    const user = session?.user || null;

    // Avoid making additional Supabase requests
    // directly inside the authentication callback.
    setTimeout(() => {
        if (user) {
            if (!currentUser || currentUser.id !== user.id) {
                startChat(user);
            }
        } else {
            stopChat();
        }
    }, 0);
});

// ========================================
// 8. START AND STOP CHAT
// ========================================

async function startChat(user) {
    if (chatStarting) return;

    chatStarting = true;
    currentUser = user;

    authScreen.hidden = true;
    chatScreen.hidden = false;

    chatMessage.textContent = "";

    try {
        await loadNames();
        await loadMessages();

        // Update header immediately
        who.textContent = "Signed in Online: 1";

        listenForNewMessages();

        messageInput.focus();
    } catch (error) {
        console.error(error);

        chatMessage.textContent =
            "Chat startup failed: " + error.message;
    } finally {
        chatStarting = false;
    }
}

function stopChat() {
    currentUser = null;

    stopOnlineCounter();

    if (channel) {
        sb.removeChannel(channel);
        channel = null;
    }

    messageList.replaceChildren();
    passwordInput.value = "";
    chatMessage.textContent = "";

    chatScreen.hidden = true;
    authScreen.hidden = false;
}

// ========================================
// 9. LOAD DISPLAY NAMES
// ========================================

async function loadNames() {
    const { data, error } = await sb
        .from("profiles")
        .select("id, display_name");

    if (error) {
        // Chat can still work if profiles has not been
        // configured; messages will use fallback names.
        console.warn("Could not load profiles:", error.message);
        return;
    }

    data.forEach((profile) => {
        if (profile.id && profile.display_name) {
            names[profile.id] = profile.display_name;
        }
    });
}

// ========================================
// 10. DISPLAY MESSAGES SAFELY
// ========================================

function showMessage(msg) {
    if (!msg || !currentUser) return;

    // Prevent duplicate messages from realtime and insert.
    const existing = Array.from(messageList.children).some(
        (item) => item.dataset.id === String(msg.id)
    );

    if (existing) return;

    const item = document.createElement("li");

    item.className =
        msg.user_id === currentUser.id
            ? "message mine"
            : "message";

    item.dataset.id = String(msg.id);

    const author = document.createElement("span");
    author.className = "author";
    author.textContent =
        names[msg.user_id] ||
        (msg.user_id === currentUser.id
            ? getDisplayName(currentUser)
            : "User");

    const body = document.createElement("p");
    body.textContent = msg.content;

    const time = document.createElement("time");

    if (msg.created_at) {
        const date = new Date(msg.created_at);

        time.dateTime = date.toISOString();
        time.textContent = date.toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit"
        });
    }

item.append(author, body, time);

// Unsend button
if (msg.user_id === currentUser.id) {
    const unsendBtn = document.createElement("button");
    unsendBtn.textContent = "Unsend";
    unsendBtn.className = "ghost";

    unsendBtn.addEventListener("click", async () => {
        const { error } = await sb
            .from("messages")
            .delete()
            .eq("id", msg.id);

        if (error) {
            console.error(error.message);
        } else {
            item.remove();
        }
    });

    item.appendChild(unsendBtn);
}

messageList.appendChild(item);

messageList.scrollTop = messageList.scrollHeight;
}

// ========================================
// 11. LOAD MESSAGE HISTORY
// ========================================

async function loadMessages() {
    const { data, error } = await sb
        .from("messages")
        .select("id, user_id, content, created_at")
        .order("created_at", { ascending: false })
        .limit(50);

    if (error) {
        console.error("Could not load messages:", error.message);
        chatMessage.textContent =
            "Could not load messages. Check your database permissions.";
        return;
    }

    messageList.replaceChildren();

    // Show oldest first.
    data.reverse().forEach(showMessage);
}

// ========================================
// 12. SEND MESSAGES
// ========================================

messageForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!currentUser) return;

    const content = messageInput.value.trim();

    if (!content) return;

    // Weather commands are handled locally.
    if (content.toLowerCase().startsWith("/weather")) {
        messageInput.value = "";
        await handleWeatherCommand(content);
        return;
    }

    // Time command
if (content.toLowerCase().startsWith("/time")) {
    messageInput.value = "";

    const manilaTime = new Date().toLocaleTimeString(
        "en-PH",
        {
            timeZone: "Asia/Manila"
        }
    );

    showBotMessage(
        "Current time in Manila: " +
        manilaTime
    );

    return;
}

    const originalContent = content;

    messageInput.value = "";
    chatMessage.textContent = "";

    const sendButton = messageForm.querySelector(
        'button[type="submit"]'
    );

    sendButton.disabled = true;

    try {
        const { data, error } = await sb
            .from("messages")
            .insert({
                content: originalContent
            })
            .select("id, user_id, content, created_at")
            .single();

        if (error) throw error;

        // Realtime may also deliver this message.
        // showMessage prevents duplicates.
        showMessage(data);
    } catch (error) {
        console.error("Send failed:", error.message);

        chatMessage.textContent =
            "Could not send message: " + error.message;

        messageInput.value = originalContent;
    } finally {
        sendButton.disabled = false;
        messageInput.focus();
    }
});

// ========================================
// 13. REALTIME MESSAGES
// ========================================

function listenForNewMessages() {
    if (channel) {
        sb.removeChannel(channel);
        channel = null;
    }

    channel = sb
        .channel("class-chat-room", {
            config: {
                presence: {
                    key: currentUser.id
                }
            }
        })

        .on(
            "postgres_changes",
            {
                event: "INSERT",
                schema: "public",
                table: "messages"
            },
            async (payload) => {
                const msg = payload.new;

                if (!currentUser) return;

                if (!names[msg.user_id]) {
                    await nameFor(msg.user_id);
                }

                showMessage(msg);
            }
        )

        .subscribe(async (status) => {
            if (status === "SUBSCRIBED") {

                await channel.track({
                    user_id: currentUser.id,
                    online_at: new Date().toISOString()
                });

                console.log("Connected to live chat.");
            }

            if (status === "CHANNEL_ERROR") {
                console.error("Realtime connection failed.");

                chatMessage.textContent =
                    "Live chat connection failed. Check Supabase Realtime.";
            }
        });
}

async function nameFor(userId) {
    if (names[userId]) return names[userId];

    const { data, error } = await sb
        .from("profiles")
        .select("display_name")
        .eq("id", userId)
        .maybeSingle();

    if (!error && data?.display_name) {
        names[userId] = data.display_name;
    } else {
        names[userId] = "User";
    }

    return names[userId];
}

// ========================================
// 14. WEATHER COMMAND
// Usage: /weather Manila
// ========================================

const GEO_URL =
    "https://geocoding-api.open-meteo.com/v1/search";

const WEATHER_URL =
    "https://api.open-meteo.com/v1/forecast";

function describeWeather(code) {
    if (code === 0) return "clear sky";
    if (code <= 3) return "partly cloudy";
    if (code <= 48) return "fog";
    if (code <= 57) return "drizzle";
    if (code <= 67) return "rain";
    if (code <= 77) return "snow";
    if (code <= 82) return "rain showers";
    if (code <= 86) return "snow showers";
    return "thunderstorm";
}

async function getWeather(city) {
    const geoResponse = await fetch(
        GEO_URL +
        "?name=" + encodeURIComponent(city) +
        "&count=1&language=en&format=json"
    );

    if (!geoResponse.ok) {
        throw new Error("Could not search for that city.");
    }

    const geoData = await geoResponse.json();

    if (!geoData.results || geoData.results.length === 0) {
        return "Sorry, I could not find " + city + ".";
    }

    const place = geoData.results[0];

    const weatherResponse = await fetch(
        WEATHER_URL +
        "?latitude=" + place.latitude +
        "&longitude=" + place.longitude +
        "&current=temperature_2m,weather_code,wind_speed_10m"
    );

    if (!weatherResponse.ok) {
        throw new Error("Could not retrieve weather.");
    }

    const weatherData = await weatherResponse.json();
    const now = weatherData.current;

    return (
        "Weather in " + place.name +
        (place.country ? ", " + place.country : "") +
        ": " + now.temperature_2m + " °C, " +
        describeWeather(now.weather_code) +
        ", wind " + now.wind_speed_10m + " km/h."
    );
}

async function handleWeatherCommand(text) {
    const parts = text.trim().split(/\s+/);
    const command = parts[0].toLowerCase();

    if (command !== "/weather") return;

    const city = parts.slice(1).join(" ");

    if (!city) {
        showBotMessage("Usage: /weather Manila");
        return;
    }

    showBotMessage("Checking the weather in " + city + "...");

    try {
        const result = await getWeather(city);
        showBotMessage(result);
    } catch (error) {
        console.error("Weather error:", error);

        showBotMessage(
            "Weather service unavailable. Please try again."
        );
    }
}

function showBotMessage(text) {
    const item = document.createElement("li");
    item.className = "message bot";

    const author = document.createElement("span");
    author.className = "author";
    author.textContent = "Weather Bot (only visible to you)";

    const body = document.createElement("p");
    body.textContent = text;

    item.append(author, body);

    messageList.appendChild(item);

    messageList.scrollTop = messageList.scrollHeight;
}