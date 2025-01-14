const RequestConfessions = require('../models/requestConfessions');
const ConfessionsSchedule = require('../models/confessionsSchedule');
const { verifyToken } = require('../helpers/gerate-token');
const userModel = require('../models/user');

module.exports = {

    createRequestConfession: async (req, res) => {
        try {
            const { date, time, intention } = req.body;
            const token = req.headers.authorization?.split(' ').pop();

            // Validar token
            if (!token) {
                return res.status(401).json({ error: 'No se proporcionó token de autorización' });
            }

            // Verificar token y obtener datos del usuario
            const tokenData = await verifyToken(token);
            const userData = await userModel.findById(tokenData._id);

            if (!userData) {
                return res.status(404).json({ error: 'Usuario no encontrado' });
            }

            // Validar datos requeridos
            if (!date || !time || !intention) {
                return res.status(400).json({ message: 'Faltan datos requeridos' });
            }

            // Crear una nueva solicitud de misa
            const newRequestConfessions = new RequestConfessions({
                date,
                time,
                intention,
                applicant: userData._id  // Guardar la ID del usuario
            });

            // Buscar la programación de cond¿fesiones para la fecha especificada
            const schedule = await ConfessionsSchedule.findOne({ date });

            if (!schedule) {
                return res.status(404).json({ message: 'No se encontró una programación de confesion para esta fecha' });
            }

            // Encontrar el horario específico y actualizar su estado
            const timeSlotIndex = schedule.timeSlots.findIndex(slot => slot.time === time);

            if (timeSlotIndex === -1) {
                return res.status(404).json({ message: 'El horario especificado no está disponible para esta fecha' });
            }

            const timeSlot = schedule.timeSlots[timeSlotIndex];

            if (timeSlot.status === 'Ocupado') {
                return res.status(400).json({ message: 'El horario ya está ocupado' });
            }

            // Actualizar el estado del horario a 'Ocupado'
            schedule.timeSlots[timeSlotIndex].status = 'Ocupado';
            await schedule.save();

            // Guardar la nueva solicitud de misa
            const savedRequestConfessions = await newRequestConfessions.save();

            // Enviar respuesta de éxito
            res.status(201).json(savedRequestConfessions);
        } catch (error) {
            console.error('Error al crear la solicitud de confesion:', error);
            res.status(500).json({ message: 'Error al crear la solicitud de confesion', error: error.message });
        }
    },

    getPendingRequestConfessions: async (req, res) => {
        try {
            const pendingConfessions = await RequestConfessions.find({ status: 'Pendiente' }).populate('applicant');
            res.status(200).json(pendingConfessions);
        } catch (error) {
            res.status(500).json({ message: "Error fetching pending request masses", error: error.message });
        }
    },

    getConfirmedRequestConfessions: async (req, res) => {
        try {
            const confirmedConfessions = await RequestConfessions.find({ status: 'Confirmada' }).populate('applicant');
            res.status(200).json(confirmedConfessions);
        } catch (error) {
            res.status(500).json({ message: "Error fetching confirmed request masses", error: error.message });
        }
    },

    confirmRequestConfession: async (req, res) => {
        try {
            const { id } = req.params; // Asumiendo que el ID se pasa como parámetro en la URL

            const updatedRequest = await RequestConfessions.findByIdAndUpdate(
                id,
                { status: 'Confirmada' },
                { new: true } // Esto hace que devuelva el documento actualizado
            );

            if (!updatedRequest) {
                return res.status(404).json({ mensaje: "Solicitud no encontrada" });
            }

            res.status(200).json({
                mensaje: "Solicitud confirmada exitosamente",
                solicitud: updatedRequest
            });
        } catch (error) {
            res.status(500).json({ mensaje: "Error al confirmar la solicitud", error: error.message });
        }
    },

    deleteRequestConfession: async (req, res) => {
        try {
            const { id } = req.params; // Asumiendo que el ID se pasa como parámetro en la URL

            // Primero, obtenemos la solicitud para conocer la fecha y hora
            const request = await RequestConfessions.findById(id);

            if (!request) {
                return res.status(404).json({ mensaje: "Solicitud no encontrada" });
            }

            // Eliminamos la solicitud
            await RequestConfessions.findByIdAndDelete(id);

            // Ahora, actualizamos el estado del horario en MassSchedule
            const updatedSchedule = await ConfessionsSchedule.findOneAndUpdate(
                {
                    date: request.date,
                    "timeSlots.time": request.time
                },
                {
                    $set: {
                        "timeSlots.$.available": true,
                        "timeSlots.$.status": "Libre"
                    }
                },
                { new: true }
            );

            if (!updatedSchedule) {
                return res.status(404).json({ mensaje: "Horario de misa no encontrado" });
            }

            res.status(200).json({
                mensaje: "Solicitud eliminada y horario actualizado exitosamente",
                horarioActualizado: updatedSchedule
            });
        } catch (error) {
            res.status(500).json({ mensaje: "Error al eliminar la solicitud", error: error.message });
        }
    }
};