import {Messages} from "./Messages";

const spans = {};
let configuration = undefined;

const messages = new Messages();

messages.startWindowListening();
messages.listenWindow("POLYGLOAT_READY", (c) => {
    configuration = c;
});

messages.listenWindow("NEW_SPAN", (s) => {
    spans[s.n] = s.data;
});


messages.startRuntimeListening();

messages.listenRuntime("GET_SPANS", (data, sendResponse) => sendResponse(spans));
messages.listenRuntime("GET_CONFIGURATION", (data, sendResponse) => sendResponse(configuration));

messages.listenRuntime("POPUP_TO_LIB", (data, done) => {
    messages.send("POPUP_TO_LIB", data);
    done();
});

messages.send("POLYGLOAT_PLUGIN_READY");