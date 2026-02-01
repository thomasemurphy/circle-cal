/**
 * D3-Labeler: Automatic label placement using simulated annealing
 * Based on https://github.com/tinker10/D3-Labeler
 * Converted to ES module
 */

export function labeler() {
  let lab = [];
  let anc = [];
  let w = 1;
  let h = 1;

  const max_move = 5.0;
  const max_angle = 0.5;
  let acc = 0;
  let rej = 0;

  // Weights for energy function
  const w_len = 0.2;      // leader line length
  const w_inter = 1.0;    // leader line intersection
  const w_lab2 = 30.0;    // label-label overlap
  const w_lab_anc = 30.0; // label-anchor overlap
  const w_orient = 3.0;   // orientation bias

  // Energy function for a label
  function energy(index) {
    const m = lab.length;
    let ener = 0;
    const dx = lab[index].x - anc[index].x;
    const dy = anc[index].y - lab[index].y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Leader line length
    ener += dist * w_len;

    // Label-label overlap
    const x21 = lab[index].x;
    const y21 = lab[index].y - lab[index].height + 2.0;
    const x22 = lab[index].x + lab[index].width;
    const y22 = lab[index].y + 2.0;

    for (let i = 0; i < m; i++) {
      if (i !== index) {
        const x11 = lab[i].x;
        const y11 = lab[i].y - lab[i].height + 2.0;
        const x12 = lab[i].x + lab[i].width;
        const y12 = lab[i].y + 2.0;

        const x_overlap = Math.max(0, Math.min(x12, x22) - Math.max(x11, x21));
        const y_overlap = Math.max(0, Math.min(y12, y22) - Math.max(y11, y21));
        const overlap_area = x_overlap * y_overlap;
        ener += overlap_area * w_lab2;
      }
    }

    // Label-anchor overlap
    for (let i = 0; i < m; i++) {
      const ancDx = anc[i].x - lab[index].x;
      const ancDy = anc[i].y - lab[index].y;
      if (ancDx >= 0 && ancDx <= lab[index].width && ancDy >= 0 && ancDy <= lab[index].height) {
        ener += w_lab_anc;
      }
    }

    return ener;
  }

  // Monte Carlo translation move
  function mcmove(currT) {
    const i = Math.floor(Math.random() * lab.length);

    const x_old = lab[i].x;
    const y_old = lab[i].y;

    const old_energy = energy(i);

    lab[i].x += (Math.random() - 0.5) * max_move;
    lab[i].y += (Math.random() - 0.5) * max_move;

    // Boundary constraints
    if (lab[i].x > w) lab[i].x = x_old;
    if (lab[i].x < 0) lab[i].x = x_old;
    if (lab[i].y > h) lab[i].y = y_old;
    if (lab[i].y < 0) lab[i].y = y_old;

    const new_energy = energy(i);
    const delta_energy = new_energy - old_energy;

    if (Math.random() < Math.exp(-delta_energy / currT)) {
      acc += 1;
    } else {
      lab[i].x = x_old;
      lab[i].y = y_old;
      rej += 1;
    }
  }

  // Monte Carlo rotation move
  function mcrotate(currT) {
    const i = Math.floor(Math.random() * lab.length);

    const x_old = lab[i].x;
    const y_old = lab[i].y;

    const old_energy = energy(i);

    const angle = (Math.random() - 0.5) * max_angle;
    const s = Math.sin(angle);
    const c = Math.cos(angle);

    const dx = lab[i].x - anc[i].x;
    const dy = lab[i].y - anc[i].y;

    lab[i].x = anc[i].x + dx * c - dy * s;
    lab[i].y = anc[i].y + dx * s + dy * c;

    // Boundary constraints
    if (lab[i].x > w) lab[i].x = x_old;
    if (lab[i].x < 0) lab[i].x = x_old;
    if (lab[i].y > h) lab[i].y = y_old;
    if (lab[i].y < 0) lab[i].y = y_old;

    const new_energy = energy(i);
    const delta_energy = new_energy - old_energy;

    if (Math.random() < Math.exp(-delta_energy / currT)) {
      acc += 1;
    } else {
      lab[i].x = x_old;
      lab[i].y = y_old;
      rej += 1;
    }
  }

  // Cooling schedule
  function cooling_schedule(currT, initialT, nsweeps) {
    return currT - (initialT / nsweeps);
  }

  const labelerApi = {
    start(nsweeps) {
      const m = lab.length;
      let currT = 1.0;
      const initialT = 1.0;

      for (let i = 0; i < nsweeps; i++) {
        for (let j = 0; j < m; j++) {
          if (Math.random() < 0.5) {
            mcmove(currT);
          } else {
            mcrotate(currT);
          }
        }
        currT = cooling_schedule(currT, initialT, nsweeps);
      }
      return labelerApi;
    },

    width(x) {
      if (!arguments.length) return w;
      w = x;
      return labelerApi;
    },

    height(x) {
      if (!arguments.length) return h;
      h = x;
      return labelerApi;
    },

    label(x) {
      if (!arguments.length) return lab;
      lab = x;
      return labelerApi;
    },

    anchor(x) {
      if (!arguments.length) return anc;
      anc = x;
      return labelerApi;
    }
  };

  return labelerApi;
}
