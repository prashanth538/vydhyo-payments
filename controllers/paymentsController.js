const paymentModel = require('../models/paymentModel');
const sequenceSchema = require('../sequence/sequenceSchema');
const paymentSchema = require('../schemas/paymentSchema');
const { SEQUENCE_PREFIX } = require('../utils/constants');

exports.createPayment = async (req, res) => {
  try {
    const { error } = paymentSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        status: 'fail',
        message: error.details[0].message,
      });
    }

    req.body.createdBy = req.headers ? req.headers.userid : null;
    req.body.updatedBy = req.headers ? req.headers.userid : null;

    const paymentCounter = await sequenceSchema.findByIdAndUpdate({
      _id: SEQUENCE_PREFIX.PAYMENTS_SEQUENCE.PAYMENTS_MODEL
    }, { $inc: { seq: 1 } }, { new: true, upsert: true });

    req.body.paymentId = SEQUENCE_PREFIX.PAYMENTS_SEQUENCE.SEQUENCE.concat(paymentCounter.seq);
    req.body.finalAmount = calculateFinalAmount(req.body.actualAmount, req.body.discount, req.body.discountType);
    if (req.body.finalAmount < 0) {
      return res.status(400).json({
        status: 'fail',
        message: 'Final amount cannot be negative',
      });
    }
    const payment = await paymentModel.create(req.body);
    if (!payment) {
      return res.status(404).json({
        status: 'fail',
        message: 'payment not created',
      });
    }

    return res.status(200).json({
      status: 'success',
      message: 'payment created successfully',
      data: payment,
    });
  } catch (error) {
    res.status(500).json({ message: 'Error creating appointment', error: error.message });
  }
};

function calculateFinalAmount(actualAmount, discount, discountType = 'flat') {
  if (discountType === 'percentage') {
    if (discount < 0 || discount > 100) {
      throw new Error('Invalid input: discount percentage must be between 0 and 100');
    }
    return actualAmount - (actualAmount * (discount / 100));
  }
  // Assuming discountType is 'flat' or any other type that is not percentage
  if (typeof actualAmount !== 'number' || typeof discount !== 'number') {
    throw new Error('Invalid input: actualAmount and discount must be numbers');
  }
  if (actualAmount < 0 || discount < 0) {
    throw new Error('Invalid input: actualAmount and discount must be non-negative');
  }
  return actualAmount - discount;
}

exports.getAppointmentPayment = async (req, res) => {
  try {
    const { appointmentId } = req.query;
    if (!appointmentId) {
      return res.status(400).json({
        status: 'fail',
        message: 'Appointment ID is required',
      });
    }

    const payment = await paymentModel.findOne({ appointmentId });
    if (!payment) {
      return res.status(404).json({
        status: 'fail',
        message: 'Payment not found for this appointment',
      });
    }

    return res.status(200).json({
      status: 'success',
      data: payment,
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching appointment payment', error: error.message });
  }
}

exports.getMultipleAppointmentPayments = async (req, res) => {
  try {
    const { appointmentIds } = req.body;
    if (!appointmentIds || !Array.isArray(appointmentIds) || appointmentIds.length === 0) {
      return res.status(400).json({
        status: 'fail',
        message: 'Appointment ID is required',
      });
    }

    const payments = await paymentModel.find({ appointmentId : { $in: appointmentIds } });
    if (!payments || payments.length === 0) {
      return res.status(404).json({
        status: 'fail',
        message: 'No payments found for this appointment',
      });
    }

    return res.status(200).json({
      status: 'success',
      payments,
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching appointment payments', error: error.message });
  }
}

// Get total amount of all payments with paymentStatus 'success' for today, this week, and this month
exports.getTotalAmount = async (req, res) => {
  try {
    const now = new Date();

    // Today
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

    // This week (assuming week starts on Sunday)
    const dayOfWeek = now.getDay(); // 0 (Sun) - 6 (Sat)
    const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 7);

    // This month
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    // Helper function for aggregation
    async function getTotal(start, end) {
      const result = await paymentModel.aggregate([
        {
          $match: {
            paymentStatus: 'success',
            createdAt: { $gte: start, $lt: end }
          }
        },
        {
          $group: {
            _id: null,
            totalAmount: { $sum: "$finalAmount" }
          }
        }
      ]);
      return result.length > 0 ? result[0].totalAmount : 0;
    }

    const [todayTotal, weekTotal, monthTotal] = await Promise.all([
      getTotal(startOfToday, endOfToday),
      getTotal(startOfWeek, endOfWeek),
      getTotal(startOfMonth, endOfMonth)
    ]);

    return res.status(200).json({
      today: todayTotal,
      week: weekTotal,
      month: monthTotal
    });
  } catch (error) {
    res.status(500).json({ message: 'Error calculating total amount', error: error.message });
  }
};