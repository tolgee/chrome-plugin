import * as React from 'react';
import {Box, Button, CircularProgress, Container} from "@material-ui/core";
import {useContext} from "react";
import {Context} from "./Context";

export const App = () => {
    let context = useContext(Context);

    console.log(context.keys);

    return (
        <Container maxWidth="sm" style={{minWidth: 500}}>
            <Box display="flex" flexWrap="wrap">
                {Object.entries(context.screenshots).map(([key, source]) =>
                    <Box
                        flexShrink={0}
                        style={{cursor: "pointer", width: "50px"}}
                        p={1}
                        onClick={() => context.openImage(source)}
                        key={key}>
                        <img width="100%" height="100%" src={source as string} alt="screenshot"/>
                    </Box>
                )}
            </Box>

            {Object.entries(context.keys).map(([k, v]) =>
                <Box onMouseOver={() => context.messages.sendToLib("HIGHLIGHT_KEY", k)}
                     onMouseOut={() => {
                         context.messages.sendToLib("UNHIGHLIGHT_KEY", k)
                     }}
                     onClick={() => context.makeScreenShot(k)}
                     key={k}>
                    {k}
                </Box>
            )}
        </Container>
    )
};