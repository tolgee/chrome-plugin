import React, {FunctionComponent, useEffect, useState} from "react";
import {Box, CircularProgress} from "@material-ui/core";
import {container} from "tsyringe";
import {ScreenShotMaker} from "./ScreenShotMaker";
import {PopupMessages} from "./PopupMessages";

const screenShotMaker = container.resolve(ScreenShotMaker);
const messages = container.resolve(PopupMessages);

export const Context = React.createContext(null);
export let Properties = undefined;

export const ContextProvider: FunctionComponent = (props) => {

    const [screenshots, setScreenShots] = useState({});
    const [spans, setSpans] = useState({});
    const [ready, setReady] = useState(undefined);

    const makeScreenShot = async (input) => {
        const screenshot = await screenShotMaker.capture(input);
        //setScreenShots([...screenshots, screenshot]);
    };

    useEffect(() => {
        messages.send("GET_CONFIGURATION").then((properties: any) => {
            if (properties?.config?.apiUrl && properties?.config?.apiKey) {
                setReady(true);
                Properties = properties;
                screenShotMaker.getScreenshots().then(setScreenShots)
            }

            messages.send("GET_SPANS").then(r => {
                setSpans(r);
            })
        });


    }, []);

    const openImage = (s) => {
        var image = new Image();
        image.src = s;

        const w = window.open("");
        w.document.write(image.outerHTML);
    };

    if (!ready) {
        if (ready === undefined) {
            return <Box width="500px" display="flex" justifyContent="center"><CircularProgress/></Box>
        }
        return <Box width="500px" p={4}>This website is not using Polygloat!</Box>
    }

    const context = {spans, ready, messages, screenshots, makeScreenShot};

    return (
        <Context.Provider value={context}>
            {props.children}
        </Context.Provider>
    )
};