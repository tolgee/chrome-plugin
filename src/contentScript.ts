import {Messages} from "./Messages";

const keys = {};
let configuration = undefined;

const messages = new Messages();

messages.startWindowListening();

messages.listenWindow("POLYGLOAT_READY", (c) => {
    if (!configuration) {
        configuration = c;
        messages.send("POLYGLOAT_PLUGIN_READY");
    }
});

messages.listenWindow("NEW_KEY", (s) => {
    keys[s.key] = s;
});

messages.startRuntimeListening();

messages.listenRuntime("GET_KEYS", (data, sendResponse) => sendResponse(keys));
messages.listenRuntime("GET_CONFIGURATION", (data, sendResponse) => sendResponse(configuration));

messages.listenRuntime("POPUP_TO_LIB", (data, done) => {
    messages.send("POPUP_TO_LIB", data);
    done();
});

