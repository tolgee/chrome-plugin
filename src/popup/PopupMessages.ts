import {singleton} from "tsyringe";

@singleton()
export class PopupMessages {
    readonly send = (type, data?) => {
        return new Promise(resolve => {
            chrome.tabs.query({active: true, currentWindow: true}, function (tabs) {
                chrome.tabs.sendMessage(tabs[0].id, {type, data}, resolve);
            });
        });
    };

    readonly sendToLib = (type, data?) => {
        return new Promise(resolve => {
            chrome.tabs.query({active: true, currentWindow: true}, function (tabs) {
                chrome.tabs.sendMessage(tabs[0].id, {type: "POPUP_TO_LIB", data: {data, type: type}}, resolve);
            });
        });
    };
}
