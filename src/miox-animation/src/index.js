import './index.scss';
import Animate from './animate';

export default function Animater(name) {
    return (app) => {
        return new Animate(app, name);
    }
}

Animater.hashChange = function hashChange() {
    return app => {
        app.set('hashchange', webview => {
            const node = webview.__MioxInjectElement__;
            const hash = app.history.uri.hash;
            const hashElement = node.querySelector(hash);
            node.scrollTop = hashElement.offsetTop;
        })
    }
}