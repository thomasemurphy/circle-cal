// D3-Labeler: Automatic label placement using simulated annealing
// Based on https://github.com/tinker10/D3-Labeler

(function() {
    d3.labeler = function() {
        var lab = [],
            anc = [],
            w = 1,
            h = 1,
            labeler = {};

        var max_move = 5.0,
            max_angle = 0.5,
            acc = 0,
            rej = 0;

        // Weights for energy function
        var w_len = 0.2,      // leader line length
            w_inter = 1.0,    // leader line intersection
            w_lab2 = 30.0,    // label-label overlap
            w_lab_anc = 30.0, // label-anchor overlap
            w_orient = 3.0;   // orientation bias

        // Energy function for a label
        var energy = function(index) {
            var m = lab.length,
                ener = 0,
                dx = lab[index].x - anc[index].x,
                dy = anc[index].y - lab[index].y,
                dist = Math.sqrt(dx * dx + dy * dy),
                overlap = true;

            // Leader line length
            ener += dist * w_len;

            // Label-label overlap
            var x21 = lab[index].x,
                y21 = lab[index].y - lab[index].height + 2.0,
                x22 = lab[index].x + lab[index].width,
                y22 = lab[index].y + 2.0;

            for (var i = 0; i < m; i++) {
                if (i !== index) {
                    var x11 = lab[i].x,
                        y11 = lab[i].y - lab[i].height + 2.0,
                        x12 = lab[i].x + lab[i].width,
                        y12 = lab[i].y + 2.0;

                    var x_overlap = Math.max(0, Math.min(x12, x22) - Math.max(x11, x21));
                    var y_overlap = Math.max(0, Math.min(y12, y22) - Math.max(y11, y21));
                    var overlap_area = x_overlap * y_overlap;
                    ener += overlap_area * w_lab2;
                }
            }

            // Label-anchor overlap
            for (var i = 0; i < m; i++) {
                var dx = anc[i].x - lab[index].x,
                    dy = anc[i].y - lab[index].y;
                if (dx >= 0 && dx <= lab[index].width && dy >= 0 && dy <= lab[index].height) {
                    ener += w_lab_anc;
                }
            }

            return ener;
        };

        // Monte Carlo translation move
        var mcmove = function(currT) {
            var i = Math.floor(Math.random() * lab.length);

            var x_old = lab[i].x,
                y_old = lab[i].y;

            var old_energy = energy(i);

            lab[i].x += (Math.random() - 0.5) * max_move;
            lab[i].y += (Math.random() - 0.5) * max_move;

            // Boundary constraints
            if (lab[i].x > w) lab[i].x = x_old;
            if (lab[i].x < 0) lab[i].x = x_old;
            if (lab[i].y > h) lab[i].y = y_old;
            if (lab[i].y < 0) lab[i].y = y_old;

            var new_energy = energy(i);
            var delta_energy = new_energy - old_energy;

            if (Math.random() < Math.exp(-delta_energy / currT)) {
                acc += 1;
            } else {
                lab[i].x = x_old;
                lab[i].y = y_old;
                rej += 1;
            }
        };

        // Monte Carlo rotation move
        var mcrotate = function(currT) {
            var i = Math.floor(Math.random() * lab.length);

            var x_old = lab[i].x,
                y_old = lab[i].y;

            var old_energy = energy(i);

            var angle = (Math.random() - 0.5) * max_angle;
            var s = Math.sin(angle),
                c = Math.cos(angle);

            var dx = lab[i].x - anc[i].x,
                dy = lab[i].y - anc[i].y;

            lab[i].x = anc[i].x + dx * c - dy * s;
            lab[i].y = anc[i].y + dx * s + dy * c;

            // Boundary constraints
            if (lab[i].x > w) lab[i].x = x_old;
            if (lab[i].x < 0) lab[i].x = x_old;
            if (lab[i].y > h) lab[i].y = y_old;
            if (lab[i].y < 0) lab[i].y = y_old;

            var new_energy = energy(i);
            var delta_energy = new_energy - old_energy;

            if (Math.random() < Math.exp(-delta_energy / currT)) {
                acc += 1;
            } else {
                lab[i].x = x_old;
                lab[i].y = y_old;
                rej += 1;
            }
        };

        // Cooling schedule
        var cooling_schedule = function(currT, initialT, nsweeps) {
            return currT - (initialT / nsweeps);
        };

        // Main entry point
        labeler.start = function(nsweeps) {
            var m = lab.length,
                currT = 1.0,
                initialT = 1.0;

            for (var i = 0; i < nsweeps; i++) {
                for (var j = 0; j < m; j++) {
                    if (Math.random() < 0.5) {
                        mcmove(currT);
                    } else {
                        mcrotate(currT);
                    }
                }
                currT = cooling_schedule(currT, initialT, nsweeps);
            }
        };

        labeler.width = function(x) {
            if (!arguments.length) return w;
            w = x;
            return labeler;
        };

        labeler.height = function(x) {
            if (!arguments.length) return h;
            h = x;
            return labeler;
        };

        labeler.label = function(x) {
            if (!arguments.length) return lab;
            lab = x;
            return labeler;
        };

        labeler.anchor = function(x) {
            if (!arguments.length) return anc;
            anc = x;
            return labeler;
        };

        return labeler;
    };
})();
