const { plans } = require('../database');

const getPlans = (req, res) => {
    // Simply return the list of plans from our data source.
    res.json(plans);
};

module.exports = { getPlans };