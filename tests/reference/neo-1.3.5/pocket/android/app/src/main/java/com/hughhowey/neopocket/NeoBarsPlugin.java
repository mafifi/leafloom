package com.hughhowey.neopocket;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// The page tells Android its background color (night, paper or light), so
// the camera cutout band and any peeking system bar match it — see
// pocket-bridge.js and MainActivity.paintBehindThePage.
@CapacitorPlugin(name = "NeoBars")
public class NeoBarsPlugin extends Plugin {
    @PluginMethod
    public void set(PluginCall call) {
        final String css = call.getString("color");
        final int c = MainActivity.parseCss(css);
        if (c != 0 && getActivity() instanceof MainActivity) {
            final MainActivity a = (MainActivity) getActivity();
            a.runOnUiThread(() -> a.paintBehindThePage(c));
        }
        call.resolve(new JSObject());
    }

    // Whether a physical keyboard is attached right now (see MainActivity)
    @PluginMethod
    public void keyboard(PluginCall call) {
        JSObject out = new JSObject();
        out.put("hardware", MainActivity.hardwareKeyboard(getContext().getResources().getConfiguration()));
        call.resolve(out);
    }
}
