// Esperar a que el documento esté completamente cargado 
document.addEventListener('DOMContentLoaded', function () {

    // Configuración de Firebase
    const firebaseConfig = {
        apiKey: "AIzaSyAOAbpgX2VmylNbP6WRp9CwzLNq_8eVjZI",
        authDomain: "bichbye--piscinas.firebaseapp.com",
        databaseURL: "https://bichbye--piscinas-default-rtdb.firebaseio.com",
        projectId: "bichbye--piscinas",
        storageBucket: "bichbye--piscinas.appspot.com",
        messagingSenderId: "753158630879",
        appId: "1:753158630879:web:28e3a5799381153406286a"
    };

    // Inicializar Firebase
    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }

    // Referencias a Firebase
    const db = firebase.database();

    // Variable para almacenar el usuario actual
    let currentUser = null;

    /*** AUTENTICACIÓN POR NOMBRE DE USUARIO Y CONTRASEÑA ***/
    // Usuarios predefinidos
    const usuarios = {
        'Seba': {
            username: 'Seba',
            password: 'Seba'
        },
        'Juan': {
            username: 'Juan',
            password: 'Juan'
        }
    };

    // Manejar inicio de sesión
    document.getElementById('loginForm').addEventListener('submit', function (e) {
        e.preventDefault();

        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;

        db.ref('usuarios/' + username).once('value').then((snapshot) => {
            if (snapshot.exists()) {
                const userData = snapshot.val();
                if (userData.password === password) {
                    currentUser = {
                        username: userData.username
                    };
                    alert('Inicio de sesión exitoso');
                    showSection('gastos');
                    document.getElementById('user-username').textContent = currentUser.username;
                } else {
                    alert('Contraseña incorrecta');
                }
            } else {
                alert('Nombre de usuario no encontrado');
            }
        });
    });

    // Manejar cierre de sesión
    document.getElementById('logout-btn').addEventListener('click', function () {
        currentUser = null;
        alert('Sesión cerrada');
        showSection('login');
        document.getElementById('user-username').textContent = '';
    });

    /*** FUNCIONES COMUNES ***/
    function getCurrentUser() {
        return currentUser;
    }

    function showSection(sectionId) {
        const sections = document.querySelectorAll('.section');
        sections.forEach(section => {
            section.style.display = 'none';
        });
        document.getElementById(sectionId).style.display = 'block';
    }

    // Mostrar sección de inicio de sesión al cargar la página
    showSection('login');

    /*** SECCIÓN DE GASTOS ***/
    // Función para registrar el gasto
    document.getElementById('gastosForm').addEventListener('submit', function (e) {
        e.preventDefault();

        const user = getCurrentUser();
        if (!user) return;

        const tipo = document.getElementById('tipo').value;
        const monto = parseFloat(document.getElementById('monto').value);
        const razon = document.getElementById('razon').value;

        let destinatario = null;
        if (tipo === 'transferencia') {
            destinatario = document.getElementById('destinatario').value;
        }

        const gasto = {
            tipo: tipo,
            monto: monto,
            razon: razon,
            fecha: new Date().toLocaleString(),
            timestamp: new Date().getTime(),
            usuario: user.username,
            repartido: false
        };

        // Guardar el gasto en Firebase
        db.ref('gastos').push(gasto);

        if (tipo === 'transferencia' && destinatario) {
            actualizarGasto(user.username, -monto);
            actualizarGasto(destinatario, monto);
            alert(`Se ha registrado una transferencia de $${monto} de ${user.username} a ${destinatario}`);
        } else {
            actualizarGasto(user.username, monto);
        }

        document.getElementById('gastosForm').reset();
    });

    // Función para actualizar el gasto de cada usuario en Firebase
    function actualizarGasto(usuario, monto) {
        const usuarioRef = db.ref('usuarios/' + usuario + '/gastos');
        usuarioRef.transaction(function (currentGastos) {
            return (currentGastos || 0) + monto;
        });
    }

    /*** SECCIÓN DE REPARTO DE GANANCIAS ***/
    // Función para calcular y mostrar el reparto de ganancias
    document.getElementById('gananciasForm').addEventListener('submit', function (e) {
        e.preventDefault();

        const user = getCurrentUser();
        if (!user) return;

        const fechaInicioInput = document.getElementById('fechaInicio').value;
        const fechaFinInput = document.getElementById('fechaFin').value;

        if (!fechaInicioInput || !fechaFinInput) {
            alert('Por favor, selecciona ambas fechas.');
            return;
        }

        const fechaInicio = new Date(fechaInicioInput).getTime();
        const fechaFin = new Date(fechaFinInput).getTime() + 86400000 - 1;

        let socios = {};

        db.ref('gastos').orderByChild('repartido').equalTo(false).once('value').then((snapshot) => {
            snapshot.forEach((childSnapshot) => {
                const gasto = childSnapshot.val();
                const fechaGasto = gasto.timestamp;

                if (fechaGasto >= fechaInicio && fechaGasto <= fechaFin) {
                    const usuario = gasto.usuario;
                    if (!socios[usuario]) {
                        socios[usuario] = { username: usuario, totalGastos: 0, totalVentas: 0 };
                    }
                    socios[usuario].totalGastos += parseFloat(gasto.monto);
                }
            });

            db.ref('ventas').orderByChild('repartido').equalTo(false).once('value').then((snapshot) => {
                snapshot.forEach((childSnapshot) => {
                    const venta = childSnapshot.val();
                    const fechaVenta = venta.timestamp;

                    if (fechaVenta >= fechaInicio && fechaVenta <= fechaFin) {
                        const usuario = venta.usuario;
                        if (!socios[usuario]) {
                            socios[usuario] = { username: usuario, totalGastos: 0, totalVentas: 0 };
                        }
                        socios[usuario].totalVentas += parseFloat(venta.precioVenta) * parseInt(venta.cantidadFrascos);
                    }
                });

                let gananciasTotales = 0;
                let totalGastosGlobal = 0;
                let totalVentasGlobal = 0;
                let detalleSocios = '';

                const sociosArray = [];

                for (let username in socios) {
                    const socio = socios[username];
                    const gananciaNeta = socio.totalVentas - socio.totalGastos;
                    gananciasTotales += gananciaNeta;
                    totalGastosGlobal += socio.totalGastos;
                    totalVentasGlobal += socio.totalVentas;

                    socio.gananciaNeta = gananciaNeta;
                    sociosArray.push(socio);

                    detalleSocios += `
                    <p><strong>${socio.username}</strong></p>
                    <p>Gastos: $${socio.totalGastos.toFixed(2)}</p>
                    <p>Ventas: $${socio.totalVentas.toFixed(2)}</p>
                    <p>Ganancia Neta: $${gananciaNeta.toFixed(2)}</p>
                    <hr>`;
                }

                const mitadGanancia = gananciasTotales / sociosArray.length;
                let transferencia = 0;

                for (let username in socios) {
                    const socio = socios[username];
                    const gananciaNeta = socio.totalVentas - socio.totalGastos;
                    if (gananciaNeta < mitadGanancia) {
                        transferencia = mitadGanancia - gananciaNeta;
                        detalleSocios += `<p><strong>${socio.username}</strong> debe transferir: $${transferencia.toFixed(2)}</p>`;
                    }
                }

                const gananciasDiv = document.getElementById('gananciasResultado');
                gananciasDiv.innerHTML = `
                <h3>Detalle por Socio</h3>
                ${detalleSocios}
                <h3>Resumen General</h3>
                <p>Total de Ventas: $${totalVentasGlobal.toFixed(2)}</p>
                <p>Total de Gastos: $${totalGastosGlobal.toFixed(2)}</p>
                <p>Ganancias Totales: $${gananciasTotales.toFixed(2)}</p>
 <p>Mitad de la Ganancia para cada socio: $${mitadGanancia.toFixed(2)}</p> 
                `;

                // Mostrar el botón para guardar el reparto
                document.getElementById('guardarGananciasBtn').style.display = 'block';

                // Almacenar temporalmente los detalles del reparto
                window.detalleGanancias = {
                    socios: socios,
                    totalVentasGlobal: totalVentasGlobal,
                    totalGastosGlobal: totalGastosGlobal,
                    gananciasTotales: gananciasTotales
                };
            });
        });
    });

    // Función para guardar el reparto de ganancias
    document.getElementById('guardarGananciasBtn').addEventListener('click', function () {
        const detalle = window.detalleGanancias;
        if (!detalle) {
            alert('No hay datos para guardar.');
            return;
        }

        const reparto = {
            totalVentas: detalle.totalVentasGlobal,
            totalGastos: detalle.totalGastosGlobal,
            gananciasTotales: detalle.gananciasTotales,
            fechaReparto: new Date().toLocaleString(),
            usuario: getCurrentUser().username
        };

        db.ref('repartos').push(reparto);

        alert('Reparto de ganancias registrado exitosamente.');

        // Limpiar la visualización y ocultar el botón de guardar
        document.getElementById('gananciasResultado').innerHTML = '';
        document.getElementById('guardarGananciasBtn').style.display = 'none';

        // Marcar los gastos y ventas como repartidos
        db.ref('gastos').orderByChild('repartido').equalTo(false).once('value').then((snapshot) => {
            snapshot.forEach((childSnapshot) => {
                const fechaGasto = childSnapshot.val().timestamp;
                if (fechaGasto >= fechaInicio && fechaGasto <= fechaFin) {
                    db.ref('gastos/' + childSnapshot.key).update({ repartido: true });
                }
            });
        });

        db.ref('ventas').orderByChild('repartido').equalTo(false).once('value').then((snapshot) => {
            snapshot.forEach((childSnapshot) => {
                const fechaVenta = childSnapshot.val().timestamp;
                if (fechaVenta >= fechaInicio && fechaVenta <= fechaFin) {
                    db.ref('ventas/' + childSnapshot.key).update({ repartido: true });
                }
            });
        });
    });

    /*** SECCIÓN DE ANOTACIONES ***/
    // Función para agregar una anotación
    document.getElementById('anotacionesForm').addEventListener('submit', function (e) {
        e.preventDefault();

        const user = getCurrentUser();
        if (!user) return;

        // Obtener el valor del formulario
        const anotacion = document.getElementById('anotacion').value;
        const fechaAnotacion = new Date().toLocaleString();

        // Crear el objeto anotación
        const nuevaAnotacion = {
            anotacion: anotacion,
            fecha: fechaAnotacion,
            usuario: user.username
        };

        // Guardar la anotación en Firebase
        db.ref('anotaciones').push(nuevaAnotacion);

        // Limpiar el formulario
        document.getElementById('anotacionesForm').reset();
    });

    // Función para mostrar las anotaciones en tiempo real
    db.ref('anotaciones').on('value', (snapshot) => {
        const listaAnotaciones = document.getElementById('listaAnotaciones');
        if (!listaAnotaciones) {
            console.error('Elemento con ID "listaAnotaciones" no encontrado en el DOM.');
            return;
        }
        listaAnotaciones.innerHTML = '';

        snapshot.forEach((childSnapshot) => {
            const anotacion = childSnapshot.val();
            const key = childSnapshot.key;
            listaAnotaciones.innerHTML += `
                <p>
                    ${anotacion.fecha} - ${anotacion.anotacion} - Registrado por: ${anotacion.usuario}
                    <button class="btn-eliminar" onclick="eliminarAnotacion('${key}')">Eliminar</button>
                </p>
            `;
        });
    });

    // Función para eliminar una anotación
    window.eliminarAnotacion = function (key) {
        if (confirm('¿Estás seguro de que deseas eliminar esta anotación?')) {
            // Mover la anotación a 'anotacionesEliminadas'
            db.ref('anotaciones/' + key).once('value').then((snapshot) => {
                const anotacionEliminada = snapshot.val();
                anotacionEliminada.eliminadoPor = getCurrentUser().username;
                anotacionEliminada.fechaEliminacion = new Date().toLocaleString();
                db.ref('anotacionesEliminadas').push(anotacionEliminada);

                // Eliminar la anotación original
                db.ref('anotaciones/' + key).remove();
            });
        }
    };
});

